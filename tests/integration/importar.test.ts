import { beforeEach, describe, expect, it } from "vitest";
import type { Club } from "@prisma/client";
import { db } from "@/lib/db";
import { importarSocios, previsualizarImportacion } from "@/modules/socios/importar";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

let club: Club;
beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
  await f.crearTipo(club.id, { nombre: "Activo" });
  await f.crearTipo(club.id, { nombre: "Cadete" });
});

const csv = (...filas: string[]) => ["nombre,apellido,dni,email,telefono,tipo", ...filas].join("\n");

describe("previsualizarImportacion", () => {
  it("marca cada fila como válida o con sus errores, sin guardar nada", async () => {
    await f.crearSocio(club.id, { dni: "30000001" });
    await f.crearUsuario({ email: "usado@club.com" });
    const r = await previsualizarImportacion(
      club.id,
      csv(
        "Ana,Paz,30111222,ana@club.com,+54 11 5555-0001,Activo",
        "Beto,Gil,30111222,,,cadete",
        ",Sosa,12,mal-email,,Vitalicio",
        "Caro,Ruiz,30000001,usado@club.com,,Activo",
      ),
    );
    expect(r.filas.map((x) => [x.linea, x.errores])).toEqual([
      [2, []],
      [3, ["DNI repetido en el archivo"]],
      [4, ["Nombre: Mínimo 2 caracteres", "DNI: 7 u 8 dígitos", "Email inválido", 'Tipo "Vitalicio" no existe']],
      [5, ["Ya hay un socio con ese DNI", "Ese email ya pertenece a otro usuario"]],
    ]);
    expect(r.validas).toBe(1);
    expect(await db.socio.count()).toBe(1);
  });

  it("exige las columnas obligatorias y un máximo de 500 filas", async () => {
    await expect(previsualizarImportacion(club.id, "nombre,dni\nAna,30111222")).rejects.toThrow(
      "Faltan columnas: apellido, tipo",
    );
    const muchas = csv(...Array.from({ length: 501 }, (_, i) => `Ana,Paz,${30000000 + i},,,Activo`));
    await expect(previsualizarImportacion(club.id, muchas)).rejects.toThrow("Máximo 500 socios por archivo");
    await expect(previsualizarImportacion(club.id, "nombre,apellido,dni,tipo\n")).rejects.toThrow("El archivo no tiene socios");
  });
});

describe("importarSocios", () => {
  it("crea todos con número correlativo, usuario e invitación para los que tienen email", async () => {
    await f.crearSocio(club.id, { nroSocio: 7 });
    const r = await importarSocios(club.id, csv("Ana,Paz,30111222,ana@club.com,,Activo", "Beto,Gil,30111223,,,Cadete"), { invitar: true });
    expect(r).toEqual({ creados: 2, invitados: 1 });
    const nuevos = await db.socio.findMany({ where: { dni: { in: ["30111222", "30111223"] } }, orderBy: { nroSocio: "asc" } });
    expect(nuevos.map((s) => [s.nombre, s.nroSocio, Boolean(s.usuarioId)])).toEqual([["Ana", 8, true], ["Beto", 9, false]]);
    expect(await db.mensajeSaliente.count({ where: { destino: "ana@club.com" } })).toBe(1);
  });

  it("sin invitar no manda mails", async () => {
    await importarSocios(club.id, csv("Ana,Paz,30111222,ana@club.com,,Activo"), { invitar: false });
    expect(await db.mensajeSaliente.count()).toBe(0);
    expect(await db.usuario.count()).toBe(1);
  });

  it("si alguna fila tiene errores no importa ninguna", async () => {
    await expect(importarSocios(club.id, csv("Ana,Paz,30111222,,,Activo", "Beto,Gil,1,,,Activo"), { invitar: false })).rejects.toThrow(
      "Hay filas con errores: corregí el archivo y volvé a intentar",
    );
    expect(await db.socio.count()).toBe(0);
  });
});
