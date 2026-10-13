import { beforeEach, describe, expect, it } from "vitest";
import type { Club } from "@prisma/client";
import { db } from "@/lib/db";
import { mensajeDeError } from "@/lib/errors";
import {
  cancelarInscripcionEvento,
  crearEvento,
  eliminarEvento,
  eventosParaSocio,
  inscribirEvento,
  obtenerEvento,
  proximosEventosClub,
} from "@/modules/calendario/eventos.service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const hoy = new Date(Date.UTC(2026, 9, 15, 15)); // jueves 15/10/2026 12:00 en Argentina

let club: Club;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
});

const evento = (over: Parameters<typeof f.crearEvento>[1] = {}) =>
  f.crearEvento(club.id, { conInscripcion: true, fecha: dia(2026, 10, 24), ...over });
const socio = () => f.crearSocio(club.id);

describe("crearEvento", () => {
  it("crea un evento con inscripción, cupo, precio y duración", async () => {
    const ev = await crearEvento(
      club.id,
      { titulo: "Cena anual", fecha: "2026-10-24", hora: "21:00", duracionMin: "180", conInscripcion: "on", cupo: "80", precio: "15000" },
      hoy,
    );
    expect(ev).toMatchObject({ conInscripcion: true, cupo: 80, precio: 15000, duracionMin: 180 });
  });

  it("sin inscripción ignora cupo y precio; con inscripción el cupo vacío es sin límite", async () => {
    const informativo = await crearEvento(club.id, { titulo: "Asamblea", fecha: "2026-10-24", hora: "20:00", cupo: "10", precio: "500" }, hoy);
    expect(informativo).toMatchObject({ conInscripcion: false, cupo: null, precio: 0, duracionMin: 60 });
    const libre = await crearEvento(club.id, { titulo: "Clínica", fecha: "2026-10-24", hora: "10:00", conInscripcion: "on", cupo: "" }, hoy);
    expect(libre).toMatchObject({ conInscripcion: true, cupo: null, precio: 0 });
  });

  it("crea un evento para todo el club (opcionales vacíos en null) o para los inscriptos de una actividad", async () => {
    const general = await crearEvento(
      club.id,
      { titulo: "Asamblea anual", fecha: "2026-10-20", hora: "20:00", lugar: "", descripcion: "", actividadId: "" },
      hoy,
    );
    expect(general).toMatchObject({ fecha: dia(2026, 10, 20), lugar: null, descripcion: null, actividadId: null });
    const act = await f.crearActividad(club.id);
    const deActividad = await crearEvento(club.id, { titulo: "Clínica", fecha: "2026-10-20", hora: "10:00", actividadId: act.id }, hoy);
    expect(deActividad.actividadId).toBe(act.id);
  });

  it("rechaza una actividad de otro club y una fecha pasada", async () => {
    const ajena = await f.crearActividad((await f.crearClub()).id);
    await expect(
      crearEvento(club.id, { titulo: "Clínica", fecha: "2026-10-20", hora: "10:00", actividadId: ajena.id }, hoy),
    ).rejects.toThrow("Actividad no encontrada");
    await expect(crearEvento(club.id, { titulo: "Viejo", fecha: "2026-10-01", hora: "10:00" }, hoy)).rejects.toThrow(
      "La fecha no puede ser pasada",
    );
  });
});

describe("inscribirEvento", () => {
  it("inscribe a un evento gratis sin cupo, sin cargo", async () => {
    const ev = await evento();
    const s = await socio();
    expect(await inscribirEvento(club.id, ev.id, s.id, hoy)).toEqual({ cargo: null });
    expect(await db.inscripcionEvento.count({ where: { eventoId: ev.id, socioId: s.id } })).toBe(1);
  });

  it("con precio crea un cargo EVENTO que vence el día del evento", async () => {
    const ev = await evento({ titulo: "Cena anual", precio: 15000 });
    const s = await socio();
    const r = await inscribirEvento(club.id, ev.id, s.id, hoy);
    const cargo = await db.cargo.findUniqueOrThrow({ where: { id: r.cargo!.id } });
    expect(cargo).toMatchObject({
      concepto: "EVENTO", clave: `EVT:${ev.id}`, periodo: "2026-10", monto: 15000, vencimiento: dia(2026, 10, 24),
      estado: "PENDIENTE", descripcion: "Cena anual (24/10)",
    });
  });

  it("al inscribirse sale de la lista de espera", async () => {
    const ev = await evento();
    const s = await socio();
    await f.anotarEsperaDirecto(club.id, s.id, { eventoId: ev.id });
    await inscribirEvento(club.id, ev.id, s.id, hoy);
    expect(await db.listaEspera.count()).toBe(0);
  });

  it("rechaza eventos sin inscripción, llenos, pasados, ya inscriptos o de otro club", async () => {
    const s = await socio();
    const informativo = await evento({ conInscripcion: false });
    await expect(inscribirEvento(club.id, informativo.id, s.id, hoy)).rejects.toThrow("Este evento no admite inscripción");
    const lleno = await evento({ cupo: 1 });
    await f.inscribirEventoDirecto(club.id, lleno.id, (await socio()).id);
    await expect(inscribirEvento(club.id, lleno.id, s.id, hoy)).rejects.toThrow("No hay cupo disponible");
    const deHoy = await evento({ fecha: dia(2026, 10, 15) });
    await expect(inscribirEvento(club.id, deHoy.id, s.id, hoy)).rejects.toThrow("El evento ya pasó");
    const libre = await evento();
    await inscribirEvento(club.id, libre.id, s.id, hoy);
    await expect(inscribirEvento(club.id, libre.id, s.id, hoy)).rejects.toThrow("Ya estás inscripto en este evento");
    const ajeno = await f.crearEvento((await f.crearClub()).id, { conInscripcion: true, fecha: dia(2026, 10, 24) });
    await expect(inscribirEvento(club.id, ajeno.id, s.id, hoy)).rejects.toThrow("Evento no encontrado");
  });

  it("un evento de una actividad solo admite a sus inscriptos", async () => {
    const act = await f.crearActividad(club.id);
    const ev = await evento({ actividadId: act.id });
    const s = await socio();
    await expect(inscribirEvento(club.id, ev.id, s.id, hoy)).rejects.toThrow("Evento no encontrado");
    await f.reservarDirecto(club.id, act.id, s.id);
    await expect(inscribirEvento(club.id, ev.id, s.id, hoy)).resolves.toEqual({ cargo: null });
  });

  it("con cupo 1 y 5 inscripciones simultáneas entra exactamente una", async () => {
    const ev = await evento({ cupo: 1 });
    const socios = await Promise.all(Array.from({ length: 5 }, () => socio()));
    const r = await Promise.allSettled(socios.map((s) => inscribirEvento(club.id, ev.id, s.id, hoy)));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    for (const x of r) if (x.status === "rejected") expect(mensajeDeError(x.reason), String(x.reason)).not.toBeNull();
    expect(await db.inscripcionEvento.count()).toBe(1);
  });
});

describe("cancelarInscripcionEvento", () => {
  it("anula el cargo pendiente e informa si liberó un lugar", async () => {
    const ev = await evento({ precio: 15000, cupo: 1 });
    const s = await socio();
    await inscribirEvento(club.id, ev.id, s.id, hoy);
    expect(await cancelarInscripcionEvento(club.id, ev.id, s.id, hoy)).toEqual({ liberado: true });
    expect(await db.inscripcionEvento.count()).toBe(0);
    expect(await db.cargo.findFirstOrThrow()).toMatchObject({ estado: "ANULADO", motivoAnulacion: "Baja del evento" });
  });

  it("reinscribirse reactiva el cargo anulado sin duplicarlo", async () => {
    const ev = await evento({ precio: 15000 });
    const s = await socio();
    await inscribirEvento(club.id, ev.id, s.id, hoy);
    await cancelarInscripcionEvento(club.id, ev.id, s.id, hoy);
    await inscribirEvento(club.id, ev.id, s.id, hoy);
    const cargos = await db.cargo.findMany();
    expect(cargos).toHaveLength(1);
    expect(cargos[0]).toMatchObject({ estado: "PENDIENTE", motivoAnulacion: null });
  });

  it("lo pagado no se anula ni se vuelve a cobrar al reinscribirse", async () => {
    const ev = await evento({ precio: 15000 });
    const s = await socio();
    const { cargo } = await inscribirEvento(club.id, ev.id, s.id, hoy);
    await db.cargo.update({ where: { id: cargo!.id }, data: { estado: "PAGADO" } });
    await cancelarInscripcionEvento(club.id, ev.id, s.id, hoy);
    expect((await db.cargo.findFirstOrThrow()).estado).toBe("PAGADO");
    expect(await inscribirEvento(club.id, ev.id, s.id, hoy)).toEqual({ cargo: null });
    expect(await db.cargo.count()).toBe(1);
  });

  it("rechaza si no estaba inscripto o si el evento ya pasó", async () => {
    const ev = await evento();
    const s = await socio();
    await expect(cancelarInscripcionEvento(club.id, ev.id, s.id, hoy)).rejects.toThrow("No estabas inscripto");
    const deHoy = await evento({ fecha: dia(2026, 10, 15) });
    await f.inscribirEventoDirecto(club.id, deHoy.id, s.id);
    await expect(cancelarInscripcionEvento(club.id, deHoy.id, s.id, hoy)).rejects.toThrow("El evento ya pasó");
  });
});

describe("eliminarEvento", () => {
  it("elimina el evento y anula los cargos pendientes de sus inscriptos", async () => {
    const ev = await evento({ precio: 15000 });
    const s = await socio();
    await inscribirEvento(club.id, ev.id, s.id, hoy);
    await eliminarEvento(club.id, ev.id);
    expect(await db.evento.count()).toBe(0);
    expect(await db.cargo.findFirstOrThrow()).toMatchObject({ estado: "ANULADO", motivoAnulacion: "Evento cancelado" });
  });

  it("rechaza un evento de otro club", async () => {
    const ajeno = await f.crearEvento((await f.crearClub()).id);
    await expect(eliminarEvento(club.id, ajeno.id)).rejects.toThrow("Evento no encontrado");
  });
});

describe("consultas", () => {
  it("eventosParaSocio lista los próximos que le corresponden, con inscripción y espera", async () => {
    const act = await f.crearActividad(club.id);
    const otraAct = await f.crearActividad(club.id);
    const s = await socio();
    await f.reservarDirecto(club.id, act.id, s.id);
    const cena = await evento({ titulo: "Cena", fecha: dia(2026, 10, 24), cupo: 1 });
    await f.inscribirEventoDirecto(club.id, cena.id, (await socio()).id);
    await f.anotarEsperaDirecto(club.id, s.id, { eventoId: cena.id });
    const clinica = await evento({ titulo: "Clínica", fecha: dia(2026, 10, 20), actividadId: act.id });
    await f.inscribirEventoDirecto(club.id, clinica.id, s.id);
    await evento({ titulo: "Ajena", actividadId: otraAct.id });
    await evento({ titulo: "Pasado", fecha: dia(2026, 10, 10) });

    const lista = await eventosParaSocio(club.id, s.id, hoy);
    expect(lista.map((e) => [e.titulo, e.inscripto, e.enEspera, e.inscriptos])).toEqual([
      ["Clínica", true, false, 1],
      ["Cena", false, true, 1],
    ]);
  });

  it("proximosEventosClub lista los del club desde hoy, con inscriptos y en espera", async () => {
    const cena = await evento({ titulo: "Cena", fecha: dia(2026, 10, 24), cupo: 1 });
    await f.inscribirEventoDirecto(club.id, cena.id, (await socio()).id);
    await f.anotarEsperaDirecto(club.id, (await socio()).id, { eventoId: cena.id });
    await evento({ titulo: "Hoy", fecha: dia(2026, 10, 15) });
    await evento({ titulo: "Pasado", fecha: dia(2026, 10, 14) });
    await f.crearEvento((await f.crearClub()).id, { fecha: dia(2026, 10, 24) });
    const lista = await proximosEventosClub(club.id, hoy);
    expect(lista.map((e) => [e.titulo, e._count.inscripciones, e._count.listaEspera])).toEqual([
      ["Hoy", 0, 0],
      ["Cena", 1, 1],
    ]);
  });

  it("obtenerEvento trae inscriptos y lista de espera, solo del club", async () => {
    const ev = await evento({ cupo: 1 });
    const [a, b] = [await socio(), await socio()];
    await f.inscribirEventoDirecto(club.id, ev.id, a.id);
    await f.anotarEsperaDirecto(club.id, b.id, { eventoId: ev.id });
    const r = await obtenerEvento(club.id, ev.id);
    expect(r?.inscripciones.map((i) => i.socio.id)).toEqual([a.id]);
    expect(r?.listaEspera.map((i) => i.socio.id)).toEqual([b.id]);
    expect(await obtenerEvento((await f.crearClub()).id, ev.id)).toBeNull();
  });
});
