import { beforeEach, describe, expect, it } from "vitest";
import type { Club } from "@prisma/client";
import { db } from "@/lib/db";
import { anotarEnEspera, enEspera, salirDeEspera } from "@/modules/actividades/lista-espera.service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const hoy = new Date(Date.UTC(2026, 9, 15, 15)); // jueves 15/10/2026

let club: Club;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
});

/** Actividad de cupo 1 (lunes 18:00) con la clase del lunes 19/10 llena. */
async function claseLlena() {
  const act = await f.crearActividad(club.id, { cupo: 1 });
  const clase = { actividadId: act.id, fecha: dia(2026, 10, 19), hora: "18:00" };
  await f.reservarDirecto(club.id, act.id, (await f.crearSocio(club.id)).id, clase);
  return clase;
}

async function eventoLleno() {
  const ev = await f.crearEvento(club.id, { conInscripcion: true, cupo: 1, fecha: dia(2026, 10, 20) });
  await f.inscribirEventoDirecto(club.id, ev.id, (await f.crearSocio(club.id)).id);
  return ev;
}

describe("lista de espera de clases", () => {
  it("anota a un socio en una clase llena y lista en orden de llegada", async () => {
    const clase = await claseLlena();
    const [a, b] = [await f.crearSocio(club.id), await f.crearSocio(club.id)];
    await anotarEnEspera(club.id, a.id, clase, hoy);
    await anotarEnEspera(club.id, b.id, clase, hoy);
    expect(await enEspera(club.id, clase)).toEqual([a.id, b.id]);
  });

  it("es por clase: la del lunes siguiente tiene lugar", async () => {
    const clase = await claseLlena();
    const s = await f.crearSocio(club.id);
    await expect(anotarEnEspera(club.id, s.id, { ...clase, fecha: dia(2026, 10, 26) }, hoy)).rejects.toThrow(
      "Todavía hay lugar: reservá directamente",
    );
  });

  it("rechaza si ya reservó, si ya está en la lista o si la clase no existe o ya empezó", async () => {
    const clase = await claseLlena();
    const [reservo] = await db.reserva.findMany();
    await expect(anotarEnEspera(club.id, reservo.socioId, clase, hoy)).rejects.toThrow("Ya reservaste esta clase");
    const s = await f.crearSocio(club.id);
    await anotarEnEspera(club.id, s.id, clase, hoy);
    await expect(anotarEnEspera(club.id, s.id, clase, hoy)).rejects.toThrow("Ya estás en la lista de espera");
    await expect(anotarEnEspera(club.id, s.id, { ...clase, hora: "20:00" }, hoy)).rejects.toThrow("Esa clase no existe");
    await expect(anotarEnEspera(club.id, s.id, { ...clase, fecha: dia(2026, 10, 12) }, hoy)).rejects.toThrow("La clase ya empezó");
  });

  it("rechaza actividades de otro club", async () => {
    const ajena = await f.crearActividad((await f.crearClub()).id, { cupo: 0 });
    const s = await f.crearSocio(club.id);
    await expect(anotarEnEspera(club.id, s.id, { actividadId: ajena.id, fecha: dia(2026, 10, 19), hora: "18:00" }, hoy)).rejects.toThrow(
      "Actividad no encontrada",
    );
  });

  it("salir de la lista la borra y rechaza si no estaba", async () => {
    const clase = await claseLlena();
    const s = await f.crearSocio(club.id);
    await anotarEnEspera(club.id, s.id, clase, hoy);
    await salirDeEspera(club.id, s.id, clase);
    expect(await db.listaEspera.count()).toBe(0);
    await expect(salirDeEspera(club.id, s.id, clase)).rejects.toThrow("No estabas en la lista de espera");
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
