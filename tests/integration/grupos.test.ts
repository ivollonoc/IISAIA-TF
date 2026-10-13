import { beforeEach, describe, expect, it } from "vitest";
import type { Club } from "@prisma/client";
import { db } from "@/lib/db";
import { agregarAlGrupo, integrantesDelGrupo, pendientesDelGrupo, quitarDelGrupo, resumenGrupos } from "@/modules/socios/grupos.service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

let club: Club;
beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
});

const socio = (nombre = "Socio") => f.crearSocio(club.id, { nombre });

describe("agregarAlGrupo", () => {
  it("suma un familiar al grupo del titular", async () => {
    const [ana, beto, caro] = [await socio("Ana"), await socio("Beto"), await socio("Caro")];
    await agregarAlGrupo(club.id, { titularId: ana.id, socioId: beto.id });
    await agregarAlGrupo(club.id, { titularId: ana.id, socioId: caro.id });
    expect((await db.socio.findMany({ where: { titularId: ana.id } })).map((s) => s.nombre).sort()).toEqual(["Beto", "Caro"]);
  });

  it("valida un solo nivel, mismo club y que no se repita", async () => {
    const [ana, beto, caro, dani] = [await socio(), await socio(), await socio(), await socio()];
    await agregarAlGrupo(club.id, { titularId: ana.id, socioId: beto.id });

    await expect(agregarAlGrupo(club.id, { titularId: ana.id, socioId: ana.id })).rejects.toThrow("Un socio no puede ser su propio familiar");
    await expect(agregarAlGrupo(club.id, { titularId: caro.id, socioId: beto.id })).rejects.toThrow("Ese socio ya está en un grupo familiar");
    await expect(agregarAlGrupo(club.id, { titularId: beto.id, socioId: caro.id })).rejects.toThrow("El titular ya es familiar de otro socio");
    await expect(agregarAlGrupo(club.id, { titularId: dani.id, socioId: ana.id })).rejects.toThrow("Ese socio es titular de otro grupo");
    const ajeno = await f.crearSocio((await f.crearClub()).id);
    await expect(agregarAlGrupo(club.id, { titularId: ana.id, socioId: ajeno.id })).rejects.toThrow("Socio no encontrado");
  });
});

describe("pendientesDelGrupo", () => {
  it("lista los cargos pendientes del titular y sus familiares, con el socio y si está vencido", async () => {
    const hoy = new Date(Date.UTC(2026, 9, 15, 15));
    const [ana, beto] = [await socio("Ana"), await socio("Beto")];
    await agregarAlGrupo(club.id, { titularId: ana.id, socioId: beto.id });
    await f.crearCargo(club.id, ana.id, { monto: 15000, vencimiento: new Date(Date.UTC(2026, 9, 20)) });
    await f.crearCargo(club.id, beto.id, { monto: 8000, vencimiento: new Date(Date.UTC(2026, 9, 10)) });
    await f.crearCargo(club.id, beto.id, { monto: 1, estado: "PAGADO" });
    await f.crearCargo(club.id, (await socio("Otro")).id);

    const r = await pendientesDelGrupo(club.id, ana.id, hoy);
    expect(r.pendientes.map((c) => [c.socio.nombre, c.monto, c.vencido])).toEqual([
      ["Beto", 8000, true],
      ["Ana", 15000, false],
    ]);
    expect(r.total).toBe(23000);
    expect(r.integrantes.map((s) => s.nombre)).toEqual(["Ana", "Beto"]);
  });

  it("presenta a los integrantes con su tipo de socio y lo que adeuda cada uno", async () => {
    const [ana, beto] = [await socio("Ana"), await socio("Beto")];
    await agregarAlGrupo(club.id, { titularId: ana.id, socioId: beto.id });
    await f.crearCargo(club.id, beto.id, { monto: 8000 });
    await f.crearCargo(club.id, beto.id, { monto: 2000 });
    const tipo = async (id: string) => (await db.tipoSocio.findUniqueOrThrow({ where: { id } })).nombre;

    const r = await pendientesDelGrupo(club.id, ana.id);
    expect(r.integrantes.map((s) => [s.nombre, s.tipoSocio.nombre, s.pendiente])).toEqual([
      ["Ana", await tipo(ana.tipoSocioId), 0],
      ["Beto", await tipo(beto.tipoSocioId), 10000],
    ]);
  });
});

describe("quitarDelGrupo / integrantesDelGrupo / resumenGrupos", () => {
  it("quita un familiar; un titular sin familiares deja de ser grupo", async () => {
    const [ana, beto] = [await socio(), await socio()];
    await agregarAlGrupo(club.id, { titularId: ana.id, socioId: beto.id });
    await quitarDelGrupo(club.id, beto.id);
    expect((await db.socio.findUniqueOrThrow({ where: { id: beto.id } })).titularId).toBeNull();
    expect((await resumenGrupos(club.id)).grupos).toBe(0);
    await expect(quitarDelGrupo(club.id, beto.id)).rejects.toThrow("Ese socio no está en un grupo familiar");
  });

  it("integrantesDelGrupo devuelve titular y familiares solo para el titular", async () => {
    const [ana, beto, caro] = [await socio("Ana"), await socio("Beto"), await socio("Caro")];
    await agregarAlGrupo(club.id, { titularId: ana.id, socioId: beto.id });
    expect((await integrantesDelGrupo(club.id, ana.id)).map((s) => s.nombre)).toEqual(["Ana", "Beto"]);
    expect((await integrantesDelGrupo(club.id, beto.id)).map((s) => s.nombre)).toEqual(["Beto"]);
    expect((await integrantesDelGrupo(club.id, caro.id)).map((s) => s.nombre)).toEqual(["Caro"]);
  });

  it("resume cantidad de grupos, socios en grupos y tamaño medio, y lista los grupos", async () => {
    const [ana, beto, caro, dani, eli] = [await socio("Ana"), await socio("Beto"), await socio("Caro"), await socio("Dani"), await socio("Eli")];
    await agregarAlGrupo(club.id, { titularId: ana.id, socioId: beto.id });
    await agregarAlGrupo(club.id, { titularId: ana.id, socioId: caro.id });
    await agregarAlGrupo(club.id, { titularId: dani.id, socioId: eli.id });
    await f.crearSocio((await f.crearClub()).id); // otro club: no cuenta

    const r = await resumenGrupos(club.id);
    expect(r).toMatchObject({ grupos: 2, sociosEnGrupos: 5, tamanioMedio: 2.5 });
    expect(r.lista.map((g) => [g.titular.nombre, g.familiares.map((x) => x.nombre)])).toEqual([
      ["Ana", ["Beto", "Caro"]],
      ["Dani", ["Eli"]],
    ]);
  });
});
