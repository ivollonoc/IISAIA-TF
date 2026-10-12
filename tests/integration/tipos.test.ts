import { beforeEach, describe, expect, it } from "vitest";
import { crearTipo, listarTipos } from "@/modules/cuotas/tipos.service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

beforeEach(resetDb);

describe("tipos de socio", () => {
  it("crea tipos y los lista ordenados por nombre con la cantidad de socios", async () => {
    const club = await f.crearClub();
    const cadete = await crearTipo(club.id, { nombre: "Cadete", cuotaMensual: "8000" });
    await crearTipo(club.id, { nombre: "Activo", cuotaMensual: 15000 });
    await f.crearSocio(club.id, { tipoSocioId: cadete.id });

    const tipos = await listarTipos(club.id);
    expect(tipos.map((t) => t.nombre)).toEqual(["Activo", "Cadete"]);
    expect(tipos[1].cuotaMensual).toBe(8000);
    expect(tipos[1]._count.socios).toBe(1);
  });

  it("rechaza un nombre repetido en el mismo club", async () => {
    const club = await f.crearClub();
    await crearTipo(club.id, { nombre: "Activo", cuotaMensual: 1 });
    await expect(crearTipo(club.id, { nombre: "Activo", cuotaMensual: 2 })).rejects.toMatchObject({ code: "P2002" });
  });

  it("permite el mismo nombre en otro club", async () => {
    const a = await f.crearClub();
    const b = await f.crearClub();
    await crearTipo(a.id, { nombre: "Activo", cuotaMensual: 1 });
    await expect(crearTipo(b.id, { nombre: "Activo", cuotaMensual: 1 })).resolves.toMatchObject({ clubId: b.id });
  });

  it("no lista tipos de otro club", async () => {
    const a = await f.crearClub();
    const b = await f.crearClub();
    await f.crearTipo(b.id);
    expect(await listarTipos(a.id)).toEqual([]);
  });
});
