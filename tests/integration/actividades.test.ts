import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Club, TipoSocio } from "@prisma/client";
import { db } from "@/lib/db";
import { mensajeDeError } from "@/lib/errors";
import {
  actividadesParaSocio,
  cancelarInscripcion,
  crearActividad,
  inscribir,
  listarActividades,
} from "@/server/actividades";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

let club: Club;
let tipo: TipoSocio;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
  tipo = await f.crearTipo(club.id);
});

const socio = (over: { activo?: boolean } = {}) => f.crearSocio(club.id, { tipoSocioId: tipo.id, ...over });

describe("crear y listar", () => {
  it("lista solo las del club, por día y hora, con cantidad de inscriptos", async () => {
    await crearActividad(club.id, { nombre: "Yoga", diaSemana: "6", hora: "10:00", cupo: "15" });
    await crearActividad(club.id, { nombre: "Natación", diaSemana: 3, hora: "19:00", cupo: 2 });
    const futbol = await crearActividad(club.id, { nombre: "Fútbol", diaSemana: 3, hora: "18:00", cupo: 20 });
    await f.inscribirDirecto(club.id, futbol.id, (await socio()).id);
    const otro = await f.crearClub();
    await f.crearActividad(otro.id);

    const lista = await listarActividades(club.id);
    expect(lista.map((a) => a.nombre)).toEqual(["Fútbol", "Natación", "Yoga"]);
    expect(lista[0]._count.inscripciones).toBe(1);
  });

  it("rechaza una hora inválida", async () => {
    // crearActividad no es async: la validación lanza sincrónicamente (como rechazo dentro de una action).
    await expect(
      (async () => crearActividad(club.id, { nombre: "Yoga", diaSemana: 1, hora: "25:00", cupo: 5 }))(),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("inscripción", () => {
  it("inscribe a un socio activo", async () => {
    const act = await f.crearActividad(club.id);
    const s = await socio();
    await inscribir(club.id, act.id, s.id);
    expect(await db.inscripcion.count({ where: { actividadId: act.id, socioId: s.id } })).toBe(1);
  });

  it("rechaza la doble inscripción", async () => {
    const act = await f.crearActividad(club.id);
    const s = await socio();
    await inscribir(club.id, act.id, s.id);
    await expect(inscribir(club.id, act.id, s.id)).rejects.toThrow("Ya estás inscripto en esta actividad");
  });

  it("rechaza a un socio inactivo", async () => {
    const act = await f.crearActividad(club.id);
    const s = await socio({ activo: false });
    await expect(inscribir(club.id, act.id, s.id)).rejects.toThrow("El socio no está activo");
  });

  it("rechaza cuando no hay cupo", async () => {
    const act = await f.crearActividad(club.id, { cupo: 1 });
    await inscribir(club.id, act.id, (await socio()).id);
    await expect(inscribir(club.id, act.id, (await socio()).id)).rejects.toThrow("No hay cupo disponible");
  });

  it("rechaza una actividad inactiva", async () => {
    const act = await f.crearActividad(club.id, { activa: false });
    await expect(inscribir(club.id, act.id, (await socio()).id)).rejects.toThrow("Actividad no encontrada");
  });

  it("rechaza una actividad de otro club", async () => {
    const otro = await f.crearClub();
    const act = await f.crearActividad(otro.id);
    await expect(inscribir(club.id, act.id, (await socio()).id)).rejects.toThrow("Actividad no encontrada");
  });

  it("rechaza a un socio de otro club", async () => {
    const otro = await f.crearClub();
    const act = await f.crearActividad(club.id);
    const ajeno = await f.crearSocio(otro.id);
    await expect(inscribir(club.id, act.id, ajeno.id)).rejects.toThrow("El socio no está activo");
    expect(await db.inscripcion.count()).toBe(0);
  });
});

describe("cancelación", () => {
  it("cancela una inscripción", async () => {
    const act = await f.crearActividad(club.id);
    const s = await socio();
    await f.inscribirDirecto(club.id, act.id, s.id);
    await cancelarInscripcion(club.id, act.id, s.id);
    expect(await db.inscripcion.count()).toBe(0);
  });

  it("rechaza cancelar sin estar inscripto", async () => {
    const act = await f.crearActividad(club.id);
    await expect(cancelarInscripcion(club.id, act.id, (await socio()).id)).rejects.toThrow("No estabas inscripto");
  });

  it("no cancela inscripciones usando el clubId de otro club", async () => {
    const otro = await f.crearClub();
    const act = await f.crearActividad(club.id);
    const s = await socio();
    await f.inscribirDirecto(club.id, act.id, s.id);
    await expect(cancelarInscripcion(otro.id, act.id, s.id)).rejects.toThrow("No estabas inscripto");
    expect(await db.inscripcion.count()).toBe(1);
  });
});

describe("actividadesParaSocio", () => {
  it("lista solo las activas, marca en cuáles está inscripto y cuenta inscriptos", async () => {
    const yo = await socio();
    const otroSocio = await socio();
    const a1 = await f.crearActividad(club.id, { nombre: "Lunes", diaSemana: 1 });
    await f.crearActividad(club.id, { nombre: "Martes", diaSemana: 2 });
    await f.crearActividad(club.id, { nombre: "Inactiva", diaSemana: 3, activa: false });
    await f.inscribirDirecto(club.id, a1.id, yo.id);
    await f.inscribirDirecto(club.id, a1.id, otroSocio.id);

    const lista = await actividadesParaSocio(club.id, yo.id);
    expect(lista.map((a) => [a.nombre, a.inscripto, a.inscriptos])).toEqual([
      ["Lunes", true, 2],
      ["Martes", false, 0],
    ]);
  });
});

describe("concurrencia", () => {
  it("con cupo 1 y 5 inscripciones simultáneas entra exactamente una y ningún rechazo es un error 500", async () => {
    const act = await f.crearActividad(club.id, { cupo: 1 });
    const socios = await Promise.all(Array.from({ length: 5 }, () => socio()));

    const resultados = await Promise.allSettled(socios.map((s) => inscribir(club.id, act.id, s.id)));

    const exitos = resultados.filter((r) => r.status === "fulfilled");
    const rechazos = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(exitos).toHaveLength(1);
    // "No hay cupo disponible" (DomainError) o conflicto de serialización (P2034): ambos tienen mensaje.
    for (const r of rechazos) expect(mensajeDeError(r.reason), String(r.reason)).not.toBeNull();
    expect(await db.inscripcion.count({ where: { actividadId: act.id } })).toBe(1);
  });
});
