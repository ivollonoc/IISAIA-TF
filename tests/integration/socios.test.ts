import { beforeEach, describe, expect, it } from "vitest";
import type { Club, TipoSocio } from "@prisma/client";
import { db } from "@/lib/db";
import { periodoActual } from "@/lib/periodo";
import { actualizarSocio, cambiarEstadoSocio, crearSocio, listarSocios, obtenerSocio } from "@/modules/socios/service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

let club: Club;
let tipo: TipoSocio;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
  tipo = await f.crearTipo(club.id);
});

const datos = (tipoSocioId: string, over: Record<string, string> = {}) => ({
  nombre: "Ana",
  apellido: "Paz",
  dni: "30111222",
  email: "",
  tipoSocioId,
  ...over,
});

describe("alta de socios", () => {
  it("asigna número de socio correlativo por club", async () => {
    const otro = await f.crearClub();
    const tipoOtro = await f.crearTipo(otro.id);
    const s1 = await crearSocio(club.id, datos(tipo.id, { dni: "30000001" }));
    const s2 = await crearSocio(club.id, datos(tipo.id, { dni: "30000002" }));
    const s3 = await crearSocio(otro.id, datos(tipoOtro.id, { dni: "30000003" }));
    expect([s1.nroSocio, s2.nroSocio, s3.nroSocio]).toEqual([1, 2, 1]);
  });

  it("rechaza un tipo de socio de otro club", async () => {
    const otro = await f.crearClub();
    const tipoOtro = await f.crearTipo(otro.id);
    await expect(crearSocio(club.id, datos(tipoOtro.id))).rejects.toThrow("Tipo de socio inválido");
  });

  it("con email crea un usuario SOCIO vinculado (email normalizado)", async () => {
    const s = await crearSocio(club.id, datos(tipo.id, { email: "Ana@Mail.com" }));
    const u = await db.usuario.findUnique({ where: { email: "ana@mail.com" } });
    expect(u).toMatchObject({ rol: "SOCIO", clubId: club.id });
    expect(s.usuarioId).toBe(u!.id);
  });

  it("sin email no crea usuario", async () => {
    const s = await crearSocio(club.id, datos(tipo.id));
    expect(s.usuarioId).toBeNull();
    expect(await db.usuario.count()).toBe(0);
  });

  it("rechaza un email de otro rol o de un socio de otro club", async () => {
    await db.usuario.create({ data: { email: "admin@club.com", rol: "ADMIN_CLUB", clubId: club.id } });
    await expect(crearSocio(club.id, datos(tipo.id, { email: "admin@club.com" }))).rejects.toThrow(
      "Ese email ya pertenece a otro usuario",
    );

    const otro = await f.crearClub();
    await db.usuario.create({ data: { email: "socio@otro.com", rol: "SOCIO", clubId: otro.id } });
    await expect(crearSocio(club.id, datos(tipo.id, { dni: "30000009", email: "socio@otro.com" }))).rejects.toThrow(
      "Ese email ya pertenece a otro usuario",
    );
    expect(await db.socio.count()).toBe(0);
  });

  it("rechaza un DNI repetido en el club", async () => {
    await crearSocio(club.id, datos(tipo.id));
    await expect(crearSocio(club.id, datos(tipo.id))).rejects.toMatchObject({ code: "P2002" });
  });

  it("permite el mismo DNI en otro club", async () => {
    const otro = await f.crearClub();
    const tipoOtro = await f.crearTipo(otro.id);
    await crearSocio(club.id, datos(tipo.id));
    await expect(crearSocio(otro.id, datos(tipoOtro.id))).resolves.toMatchObject({ clubId: otro.id });
  });
});

describe("modificación y baja lógica", () => {
  it("actualiza los datos del socio", async () => {
    const s = await crearSocio(club.id, datos(tipo.id));
    const act = await actualizarSocio(club.id, s.id, datos(tipo.id, { nombre: "Ana María" }));
    expect(act.nombre).toBe("Ana María");
  });

  it("no actualiza un socio de otro club", async () => {
    const otro = await f.crearClub();
    const s = await f.crearSocio(otro.id, { nombre: "Original" });
    await expect(actualizarSocio(club.id, s.id, datos(tipo.id))).rejects.toThrow("Socio no encontrado");
    expect((await db.socio.findUnique({ where: { id: s.id } }))?.nombre).toBe("Original");
  });

  it("da de baja y de alta lógicamente", async () => {
    const s = await f.crearSocio(club.id, { tipoSocioId: tipo.id });
    await cambiarEstadoSocio(club.id, s.id, false);
    expect((await db.socio.findUnique({ where: { id: s.id } }))?.activo).toBe(false);
    await cambiarEstadoSocio(club.id, s.id, true);
    expect((await db.socio.findUnique({ where: { id: s.id } }))?.activo).toBe(true);
  });

  it("no cambia el estado de un socio de otro club", async () => {
    const otro = await f.crearClub();
    const s = await f.crearSocio(otro.id);
    await expect(cambiarEstadoSocio(club.id, s.id, false)).rejects.toThrow("Socio no encontrado");
    expect((await db.socio.findUnique({ where: { id: s.id } }))?.activo).toBe(true);
  });
});

describe("consultas", () => {
  it("obtenerSocio no encuentra socios de otro club", async () => {
    const otro = await f.crearClub();
    const s = await f.crearSocio(otro.id);
    await expect(obtenerSocio(club.id, s.id)).rejects.toThrow("Socio no encontrado");
  });

  it("listarSocios devuelve solo los del club, por número, con el pago del período actual", async () => {
    const otro = await f.crearClub();
    const s2 = await f.crearSocio(club.id, { tipoSocioId: tipo.id, nroSocio: 2 });
    const s1 = await f.crearSocio(club.id, { tipoSocioId: tipo.id, nroSocio: 1 });
    await f.crearSocio(otro.id);
    await f.crearPagoDirecto(club.id, s2.id, { periodo: periodoActual() });
    await f.crearPagoDirecto(club.id, s1.id, { periodo: "2020-01" });

    const lista = await listarSocios(club.id);
    expect(lista.map((s) => s.id)).toEqual([s1.id, s2.id]);
    expect(lista[0].pagos).toHaveLength(0);
    expect(lista[1].pagos).toHaveLength(1);
  });
});
