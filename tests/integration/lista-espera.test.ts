import { beforeEach, describe, expect, it } from "vitest";
import type { Club } from "@prisma/client";
import { db } from "@/lib/db";
import { anotarEnEspera, enEspera, salirDeEspera } from "@/modules/actividades/lista-espera.service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const hoy = new Date(Date.UTC(2026, 9, 15, 15));

let club: Club;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
});

async function actividadLlena() {
  const act = await f.crearActividad(club.id, { cupo: 1 });
  await f.inscribirDirecto(club.id, act.id, (await f.crearSocio(club.id)).id);
  return act;
}

async function eventoLleno() {
  const ev = await f.crearEvento(club.id, { conInscripcion: true, cupo: 1, fecha: dia(2026, 10, 20) });
  await f.inscribirEventoDirecto(club.id, ev.id, (await f.crearSocio(club.id)).id);
  return ev;
}

describe("lista de espera de actividades", () => {
  it("anota a un socio en una actividad llena y lo lista en orden de llegada", async () => {
    const act = await actividadLlena();
    const [a, b] = [await f.crearSocio(club.id), await f.crearSocio(club.id)];
    await anotarEnEspera(club.id, a.id, { actividadId: act.id }, hoy);
    await anotarEnEspera(club.id, b.id, { actividadId: act.id }, hoy);
    expect(await enEspera(club.id, { actividadId: act.id })).toEqual([a.id, b.id]);
  });

  it("rechaza si todavía hay lugar, si ya está inscripto o si ya está en la lista", async () => {
    const libre = await f.crearActividad(club.id, { cupo: 5 });
    const s = await f.crearSocio(club.id);
    await expect(anotarEnEspera(club.id, s.id, { actividadId: libre.id }, hoy)).rejects.toThrow(
      "Todavía hay lugar: inscribite directamente",
    );
    const llena = await f.crearActividad(club.id, { cupo: 1 });
    await f.inscribirDirecto(club.id, llena.id, s.id);
    await expect(anotarEnEspera(club.id, s.id, { actividadId: llena.id }, hoy)).rejects.toThrow("Ya estás inscripto");
    const otra = await actividadLlena();
    await anotarEnEspera(club.id, s.id, { actividadId: otra.id }, hoy);
    await expect(anotarEnEspera(club.id, s.id, { actividadId: otra.id }, hoy)).rejects.toThrow("Ya estás en la lista de espera");
  });

  it("rechaza actividades de otro club o inactivas", async () => {
    const ajena = await f.crearActividad((await f.crearClub()).id, { cupo: 0 });
    const s = await f.crearSocio(club.id);
    await expect(anotarEnEspera(club.id, s.id, { actividadId: ajena.id }, hoy)).rejects.toThrow("Actividad no encontrada");
  });

  it("salir de la lista la borra y rechaza si no estaba", async () => {
    const act = await actividadLlena();
    const s = await f.crearSocio(club.id);
    await anotarEnEspera(club.id, s.id, { actividadId: act.id }, hoy);
    await salirDeEspera(club.id, s.id, { actividadId: act.id });
    expect(await db.listaEspera.count()).toBe(0);
    await expect(salirDeEspera(club.id, s.id, { actividadId: act.id })).rejects.toThrow("No estabas en la lista de espera");
  });
});

describe("lista de espera de eventos", () => {
  it("anota en un evento lleno con inscripción", async () => {
    const ev = await eventoLleno();
    const s = await f.crearSocio(club.id);
    await anotarEnEspera(club.id, s.id, { eventoId: ev.id }, hoy);
    expect(await enEspera(club.id, { eventoId: ev.id })).toEqual([s.id]);
  });

  it("rechaza eventos sin inscripción, sin cupo (nunca se llenan) o pasados", async () => {
    const s = await f.crearSocio(club.id);
    const informativo = await f.crearEvento(club.id, { fecha: dia(2026, 10, 20) });
    await expect(anotarEnEspera(club.id, s.id, { eventoId: informativo.id }, hoy)).rejects.toThrow(
      "Este evento no admite inscripción",
    );
    const sinCupo = await f.crearEvento(club.id, { conInscripcion: true, fecha: dia(2026, 10, 20) });
    await expect(anotarEnEspera(club.id, s.id, { eventoId: sinCupo.id }, hoy)).rejects.toThrow(
      "Todavía hay lugar: inscribite directamente",
    );
    const pasado = await f.crearEvento(club.id, { conInscripcion: true, cupo: 0, fecha: dia(2026, 10, 15) });
    await expect(anotarEnEspera(club.id, s.id, { eventoId: pasado.id }, hoy)).rejects.toThrow("El evento ya pasó");
  });
});
