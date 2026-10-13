import { beforeEach, describe, expect, it } from "vitest";
import type { Club, TipoSocio } from "@prisma/client";
import { db } from "@/lib/db";
import { mensajeDeError } from "@/lib/errors";
import { cancelarReserva, clasesParaSocio, reservar, reservarSerie, reservasDeClase } from "@/modules/reservas/service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const hoy = new Date(Date.UTC(2026, 9, 15, 15)); // jueves 15/10/2026 12:00 en Argentina

let club: Club;
let tipo: TipoSocio;
let yoga: { id: string };

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
  tipo = await f.crearTipo(club.id);
  // Yoga: martes y jueves 10:00, cupo 2.
  yoga = await f.crearActividad(club.id, {
    nombre: "Yoga", cupo: 2, horarios: [{ diaSemana: 2, hora: "10:00" }, { diaSemana: 4, hora: "10:00" }],
  });
});

const socio = (over: { activo?: boolean } = {}) => f.crearSocio(club.id, { tipoSocioId: tipo.id, ...over });
const martes = { fecha: "2026-10-20", hora: "10:00" };

describe("reservar", () => {
  it("reserva una clase futura con lugar", async () => {
    const s = await socio();
    expect(await reservar(club.id, s.id, { actividadId: yoga.id, ...martes }, hoy)).toEqual({ cargo: null });
    expect(await db.reserva.findFirstOrThrow()).toMatchObject({ socioId: s.id, fecha: dia(2026, 10, 20), hora: "10:00" });
  });

  it("el cupo es por clase: llena una clase, la otra sigue con lugar", async () => {
    await reservar(club.id, (await socio()).id, { actividadId: yoga.id, ...martes }, hoy);
    await reservar(club.id, (await socio()).id, { actividadId: yoga.id, ...martes }, hoy);
    const tercero = await socio();
    await expect(reservar(club.id, tercero.id, { actividadId: yoga.id, ...martes }, hoy)).rejects.toThrow("No hay lugar en esta clase");
    await expect(reservar(club.id, tercero.id, { actividadId: yoga.id, fecha: "2026-10-22", hora: "10:00" }, hoy)).resolves.toBeTruthy();
  });

  it("rechaza clases inexistentes, pasadas, de hoy ya empezadas, suspendidas o fuera de vigencia", async () => {
    const s = await socio();
    const intentar = (clase: { fecha: string; hora: string }, cuando = hoy) => reservar(club.id, s.id, { actividadId: yoga.id, ...clase }, cuando);
    await expect(intentar({ fecha: "2026-10-21", hora: "10:00" })).rejects.toThrow("Esa clase no existe");
    await expect(intentar({ fecha: "2026-10-20", hora: "11:00" })).rejects.toThrow("Esa clase no existe");
    await expect(intentar({ fecha: "2026-10-13", hora: "10:00" })).rejects.toThrow("La clase ya empezó");
    await expect(intentar({ fecha: "2026-10-15", hora: "10:00" })).rejects.toThrow("La clase ya empezó"); // hoy 12:00
    await f.crearExcepcion(club.id, yoga.id, { fecha: dia(2026, 10, 27), hora: "10:00" });
    await expect(intentar({ fecha: "2026-10-27", hora: "10:00" })).rejects.toThrow("La clase está suspendida");
    const corta = await f.crearActividad(club.id, { horarios: [{ diaSemana: 2, hora: "10:00" }], fechaFin: dia(2026, 10, 25) });
    await expect(reservar(club.id, s.id, { actividadId: corta.id, fecha: "2026-10-27", hora: "10:00" }, hoy)).rejects.toThrow(
      "Esa clase no existe",
    );
  });

  it("rechaza la doble reserva, socios inactivos y actividades de otro club", async () => {
    const s = await socio();
    await reservar(club.id, s.id, { actividadId: yoga.id, ...martes }, hoy);
    await expect(reservar(club.id, s.id, { actividadId: yoga.id, ...martes }, hoy)).rejects.toThrow("Ya reservaste esta clase");
    await expect(reservar(club.id, (await socio({ activo: false })).id, { actividadId: yoga.id, ...martes }, hoy)).rejects.toThrow(
      "El socio no está activo",
    );
    const ajena = await f.crearActividad((await f.crearClub()).id, { horarios: [{ diaSemana: 2, hora: "10:00" }] });
    await expect(reservar(club.id, s.id, { actividadId: ajena.id, ...martes }, hoy)).rejects.toThrow("Actividad no encontrada");
  });

  it("una clase reprogramada se reserva por su clave original mientras su nueva fecha no pasó", async () => {
    await f.crearExcepcion(club.id, yoga.id, {
      fecha: dia(2026, 10, 13), hora: "10:00", tipo: "REPROGRAMADA", nuevaFecha: dia(2026, 10, 16), nuevaHora: "18:00",
    });
    const s = await socio();
    await expect(reservar(club.id, s.id, { actividadId: yoga.id, fecha: "2026-10-13", hora: "10:00" }, hoy)).resolves.toBeTruthy();
  });

  it("con precio por clase crea un cargo CLASE que vence el día de la clase; reservar sale de la lista de espera", async () => {
    const pago = await f.crearActividad(club.id, { nombre: "Spinning", precioClase: 1500, horarios: [{ diaSemana: 2, hora: "19:00" }] });
    const s = await socio();
    await f.anotarEsperaDirecto(club.id, s.id, { actividadId: pago.id, fecha: dia(2026, 10, 20), hora: "19:00" });
    const r = await reservar(club.id, s.id, { actividadId: pago.id, fecha: "2026-10-20", hora: "19:00" }, hoy);
    expect(await db.cargo.findUniqueOrThrow({ where: { id: r.cargo!.id } })).toMatchObject({
      concepto: "CLASE", clave: `CLA:${pago.id}:2026-10-20:19:00`, monto: 1500, periodo: "2026-10",
      vencimiento: dia(2026, 10, 20), descripcion: "Spinning Mar 20/10 19:00",
    });
    expect(await db.listaEspera.count()).toBe(0);
  });

  it("con cupo 1 y 5 reservas simultáneas entra exactamente una", async () => {
    const uno = await f.crearActividad(club.id, { cupo: 1, horarios: [{ diaSemana: 2, hora: "10:00" }] });
    const socios = await Promise.all(Array.from({ length: 5 }, () => socio()));
    const r = await Promise.allSettled(socios.map((s) => reservar(club.id, s.id, { actividadId: uno.id, ...martes }, hoy)));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    for (const x of r) if (x.status === "rejected") expect(mensajeDeError(x.reason), String(x.reason)).not.toBeNull();
    expect(await db.reserva.count({ where: { actividadId: uno.id } })).toBe(1);
  });
});

describe("reservarSerie", () => {
  it("reserva las próximas N clases de un horario y saltea las llenas, suspendidas o ya reservadas", async () => {
    const s = await socio();
    // 20/10 lleno, 27/10 suspendido, 3/11 ya reservado, 10/11 libre.
    await f.reservarDirecto(club.id, yoga.id, (await socio()).id, { fecha: dia(2026, 10, 20), hora: "10:00" });
    await f.reservarDirecto(club.id, yoga.id, (await socio()).id, { fecha: dia(2026, 10, 20), hora: "10:00" });
    await f.crearExcepcion(club.id, yoga.id, { fecha: dia(2026, 10, 27), hora: "10:00" });
    await f.reservarDirecto(club.id, yoga.id, s.id, { fecha: dia(2026, 11, 3), hora: "10:00" });

    const r = await reservarSerie(club.id, s.id, { actividadId: yoga.id, diaSemana: "2", hora: "10:00", semanas: "4" }, hoy);
    expect(r).toEqual({ reservadas: 1, completas: 1, otras: 2 });
    const mias = await db.reserva.findMany({ where: { socioId: s.id }, orderBy: { fecha: "asc" } });
    expect(mias.map((x) => x.fecha.toISOString().slice(0, 10))).toEqual(["2026-11-03", "2026-11-10"]);
  });

  it("valida el horario y la cantidad de semanas", async () => {
    const s = await socio();
    await expect(reservarSerie(club.id, s.id, { actividadId: yoga.id, diaSemana: "1", hora: "10:00", semanas: "4" }, hoy)).rejects.toThrow(
      "Esa actividad no tiene ese horario",
    );
    await expect(reservarSerie(club.id, s.id, { actividadId: yoga.id, diaSemana: "2", hora: "10:00", semanas: "13" }, hoy)).rejects.toThrow();
  });
});

describe("cancelarReserva", () => {
  it("cancela, anula el cargo pendiente y avisa a la lista de espera solo si la clase estaba llena", async () => {
    const pago = await f.crearActividad(club.id, { nombre: "Spinning", cupo: 1, precioClase: 1500, horarios: [{ diaSemana: 2, hora: "19:00" }] });
    const clase = { actividadId: pago.id, fecha: "2026-10-20", hora: "19:00" };
    const s = await socio();
    const { socio: espera, usuario } = await f.crearSocioConUsuario(club.id);
    await reservar(club.id, s.id, clase, hoy);
    await f.anotarEsperaDirecto(club.id, espera.id, { actividadId: pago.id, fecha: dia(2026, 10, 20), hora: "19:00" });

    await cancelarReserva(club.id, s.id, clase, hoy);
    expect(await db.reserva.count()).toBe(0);
    expect(await db.cargo.findFirstOrThrow()).toMatchObject({ estado: "ANULADO", motivoAnulacion: "Reserva cancelada" });
    const avisos = await db.notificacion.findMany({ where: { usuarioId: usuario.id } });
    expect(avisos.map((a) => a.titulo)).toEqual(["Se liberó un lugar en Spinning"]);
    expect(avisos[0].cuerpo).toContain("Mar 20/10 19:00");

    // Reservar de nuevo reactiva el cargo anulado.
    await reservar(club.id, s.id, clase, hoy);
    expect(await db.cargo.count()).toBe(1);
    expect((await db.cargo.findFirstOrThrow()).estado).toBe("PENDIENTE");
  });

  it("rechaza si no tenía la reserva o si la clase ya empezó", async () => {
    const s = await socio();
    await expect(cancelarReserva(club.id, s.id, { actividadId: yoga.id, ...martes }, hoy)).rejects.toThrow("No tenías reservada esta clase");
    await f.reservarDirecto(club.id, yoga.id, s.id, { fecha: dia(2026, 10, 15), hora: "10:00" });
    await expect(cancelarReserva(club.id, s.id, { actividadId: yoga.id, fecha: "2026-10-15", hora: "10:00" }, hoy)).rejects.toThrow(
      "La clase ya empezó",
    );
  });
});

describe("consultas", () => {
  it("clasesParaSocio lista por actividad las próximas clases con lugares, reserva y espera", async () => {
    const s = await socio();
    await f.reservarDirecto(club.id, yoga.id, s.id, { fecha: dia(2026, 10, 20), hora: "10:00" });
    await f.reservarDirecto(club.id, yoga.id, (await socio()).id, { fecha: dia(2026, 10, 22), hora: "10:00" });
    await f.reservarDirecto(club.id, yoga.id, (await socio()).id, { fecha: dia(2026, 10, 22), hora: "10:00" });
    await f.anotarEsperaDirecto(club.id, s.id, { actividadId: yoga.id, fecha: dia(2026, 10, 22), hora: "10:00" });
    await f.crearExcepcion(club.id, yoga.id, { fecha: dia(2026, 10, 27), hora: "10:00", motivo: "Feriado" });

    const [act] = (await clasesParaSocio(club.id, s.id, hoy, 14)).filter((a) => a.id === yoga.id);
    expect(act.clases.map((c) => [c.fecha.toISOString().slice(5, 10), c.hora, c.estado, c.reservas, c.reservada, c.enEspera])).toEqual([
      ["10-20", "10:00", "NORMAL", 1, true, false],
      ["10-22", "10:00", "NORMAL", 2, false, true],
      ["10-27", "10:00", "SUSPENDIDA", 0, false, false],
      ["10-29", "10:00", "NORMAL", 0, false, false],
    ]);
  });

  it("reservasDeClase devuelve quién reservó, solo del club", async () => {
    const s = await f.crearSocio(club.id, { tipoSocioId: tipo.id, nombre: "Ana" });
    await f.reservarDirecto(club.id, yoga.id, s.id, { fecha: dia(2026, 10, 20), hora: "10:00" });
    expect((await reservasDeClase(club.id, yoga.id, dia(2026, 10, 20), "10:00")).map((r) => r.socio.nombre)).toEqual(["Ana"]);
    expect(await reservasDeClase((await f.crearClub()).id, yoga.id, dia(2026, 10, 20), "10:00")).toEqual([]);
  });
});
