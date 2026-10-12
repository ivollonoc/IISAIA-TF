import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Club } from "@prisma/client";
import { db } from "@/lib/db";
import {
  calendarioClub,
  crearEvento,
  eliminarEvento,
  obtenerClase,
  obtenerEvento,
  reprogramarClase,
  restablecerClase,
  suspenderClase,
} from "@/modules/calendario/service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const hoy = new Date(Date.UTC(2026, 9, 15, 15)); // jueves 15/10/2026 12:00 en Argentina

let club: Club;
let natacion: { id: string }; // miércoles 19:00

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
  natacion = await f.crearActividad(club.id, { nombre: "Natación", horarios: [{ diaSemana: 3, hora: "19:00" }] });
});

const suspender = (over: Record<string, string> = {}) =>
  suspenderClase(club.id, { actividadId: natacion.id, fecha: "2026-10-21", motivo: "Feriado", ...over }, hoy);

describe("suspenderClase", () => {
  it("suspende una clase futura de la regla", async () => {
    const e = await suspender();
    expect(e).toMatchObject({ tipo: "SUSPENDIDA", fecha: dia(2026, 10, 21), motivo: "Feriado", clubId: club.id });
  });

  it("rechaza una fecha que no es de la regla", async () => {
    await expect(suspender({ fecha: "2026-10-22" })).rejects.toThrow("Esa fecha no corresponde a una clase de la actividad");
  });

  it("rechaza clases pasadas", async () => {
    await expect(suspender({ fecha: "2026-10-14" })).rejects.toThrow("No se pueden modificar clases pasadas");
  });

  it("rechaza una clase que ya tiene un cambio", async () => {
    await suspender();
    await expect(suspender({ motivo: "Lluvia" })).rejects.toThrow("Esa clase ya tiene un cambio: restablecela primero");
  });

  it("rechaza actividades de otro club o inactivas", async () => {
    const otro = await f.crearClub();
    const ajena = await f.crearActividad(otro.id, { horarios: [{ diaSemana: 3, hora: "18:00" }] });
    await expect(suspender({ actividadId: ajena.id })).rejects.toThrow("Actividad no encontrada");
    const cerrada = await f.crearActividad(club.id, { horarios: [{ diaSemana: 3, hora: "18:00" }], activa: false });
    await expect(suspender({ actividadId: cerrada.id })).rejects.toThrow("Actividad no encontrada");
  });

  it("acepta cualquiera de los días de la actividad y rechaza fechas posteriores a su fin", async () => {
    const funcional = await f.crearActividad(club.id, {
      horarios: [{ diaSemana: 1, hora: "19:00" }, { diaSemana: 5, hora: "08:00" }], fechaFin: dia(2026, 10, 20),
    });
    await expect(suspender({ actividadId: funcional.id, fecha: "2026-10-16" })).resolves.toBeTruthy();
    await expect(suspender({ actividadId: funcional.id, fecha: "2026-10-26" })).rejects.toThrow(
      "Esa fecha no corresponde a una clase de la actividad",
    );
  });

  it("exige motivo y una fecha válida", async () => {
    await expect(suspender({ motivo: "" })).rejects.toBeInstanceOf(ZodError);
    await expect(suspender({ fecha: "2026-02-31" })).rejects.toBeInstanceOf(ZodError);
  });
});

describe("reprogramarClase", () => {
  const reprogramar = (over: Record<string, string> = {}) =>
    reprogramarClase(
      club.id,
      { actividadId: natacion.id, fecha: "2026-10-21", nuevaFecha: "2026-10-22", nuevaHora: "20:00", motivo: "Pileta en mantenimiento", ...over },
      hoy,
    );

  it("guarda la nueva fecha y hora", async () => {
    expect(await reprogramar()).toMatchObject({
      tipo: "REPROGRAMADA", fecha: dia(2026, 10, 21), nuevaFecha: dia(2026, 10, 22), nuevaHora: "20:00",
    });
  });

  it("rechaza una nueva fecha pasada", async () => {
    await expect(reprogramar({ nuevaFecha: "2026-10-10" })).rejects.toThrow("La nueva fecha no puede ser pasada");
  });

  it("rechaza el mismo horario que el original", async () => {
    await expect(reprogramar({ nuevaFecha: "2026-10-21", nuevaHora: "19:00" })).rejects.toThrow(
      "Elegí una fecha u hora distinta",
    );
  });

  it("compara contra la hora del horario de ese día", async () => {
    const funcional = await f.crearActividad(club.id, { horarios: [{ diaSemana: 1, hora: "19:00" }, { diaSemana: 5, hora: "08:00" }] });
    const base = { actividadId: funcional.id, fecha: "2026-10-16", nuevaFecha: "2026-10-16" };
    await expect(reprogramar({ ...base, nuevaHora: "08:00" })).rejects.toThrow("Elegí una fecha u hora distinta");
    await expect(reprogramar({ ...base, nuevaHora: "19:00" })).resolves.toBeTruthy();
  });
});

describe("restablecerClase", () => {
  it("borra el cambio y la clase vuelve a la regla", async () => {
    const e = await suspender();
    await restablecerClase(club.id, e.id, hoy);
    expect(await db.excepcionClase.count()).toBe(0);
    const items = await calendarioClub(club.id, dia(2026, 10, 21), dia(2026, 10, 21));
    expect(items[0]).toMatchObject({ estado: "NORMAL" });
  });

  it("no restablece cambios de otro club", async () => {
    const otro = await f.crearClub();
    const ajena = await f.crearActividad(otro.id, { horarios: [{ diaSemana: 3, hora: "18:00" }] });
    const e = await f.crearExcepcion(otro.id, ajena.id);
    await expect(restablecerClase(club.id, e.id, hoy)).rejects.toThrow("Cambio no encontrado");
  });

  it("no restablece clases pasadas", async () => {
    const e = await f.crearExcepcion(club.id, natacion.id, { fecha: dia(2026, 10, 7) });
    await expect(restablecerClase(club.id, e.id, hoy)).rejects.toThrow("No se pueden modificar clases pasadas");
  });
});

describe("eventos", () => {
  it("crea un evento para todo el club (campos opcionales vacíos quedan en null)", async () => {
    const ev = await crearEvento(
      club.id,
      { titulo: "Asamblea anual", fecha: "2026-10-20", hora: "20:00", lugar: "", descripcion: "", actividadId: "" },
      hoy,
    );
    expect(ev).toMatchObject({ titulo: "Asamblea anual", fecha: dia(2026, 10, 20), lugar: null, descripcion: null, actividadId: null });
  });

  it("crea un evento para los inscriptos de una actividad", async () => {
    const ev = await crearEvento(
      club.id,
      { titulo: "Clínica", fecha: "2026-10-20", hora: "10:00", lugar: "Pileta", actividadId: natacion.id },
      hoy,
    );
    expect(ev).toMatchObject({ actividadId: natacion.id, lugar: "Pileta" });
  });

  it("rechaza una actividad de otro club y una fecha pasada", async () => {
    const otro = await f.crearClub();
    const ajena = await f.crearActividad(otro.id);
    await expect(
      crearEvento(club.id, { titulo: "Clínica", fecha: "2026-10-20", hora: "10:00", actividadId: ajena.id }, hoy),
    ).rejects.toThrow("Actividad no encontrada");
    await expect(crearEvento(club.id, { titulo: "Viejo", fecha: "2026-10-01", hora: "10:00" }, hoy)).rejects.toThrow(
      "La fecha no puede ser pasada",
    );
  });

  it("elimina un evento del club y rechaza uno de otro club", async () => {
    const ev = await f.crearEvento(club.id);
    await eliminarEvento(club.id, ev.id);
    expect(await db.evento.count()).toBe(0);
    const otro = await f.crearClub();
    const ajeno = await f.crearEvento(otro.id);
    await expect(eliminarEvento(club.id, ajeno.id)).rejects.toThrow("Evento no encontrado");
  });
});

describe("obtenerClase / obtenerEvento (selección desde la URL)", () => {
  it("devuelve la clase con su cambio si existe", async () => {
    const e = await suspender();
    const c = await obtenerClase(club.id, `${natacion.id}:2026-10-21`);
    expect(c?.actividad.id).toBe(natacion.id);
    expect(c?.fecha).toEqual(dia(2026, 10, 21));
    expect(c?.excepcion?.id).toBe(e.id);
  });

  it("devuelve null para claves manipuladas: otro club, fecha fuera de la regla o mal formada", async () => {
    const otro = await f.crearClub();
    const ajena = await f.crearActividad(otro.id, { horarios: [{ diaSemana: 3, hora: "18:00" }] });
    expect(await obtenerClase(club.id, `${ajena.id}:2026-10-21`)).toBeNull();
    expect(await obtenerClase(club.id, `${natacion.id}:2026-10-22`)).toBeNull();
    expect(await obtenerClase(club.id, `${natacion.id}:basura`)).toBeNull();
    expect(await obtenerClase(club.id, "sin-separador")).toBeNull();
  });

  it("devuelve null para una actividad inactiva (no ofrece formularios que van a fallar)", async () => {
    const cerrada = await f.crearActividad(club.id, { horarios: [{ diaSemana: 3, hora: "18:00" }], activa: false });
    expect(await obtenerClase(club.id, `${cerrada.id}:2026-10-21`)).toBeNull();
  });

  it("obtenerEvento solo encuentra eventos del club", async () => {
    const ev = await f.crearEvento(club.id, { actividadId: natacion.id });
    expect((await obtenerEvento(club.id, ev.id))?.actividad?.nombre).toBe("Natación");
    const otro = await f.crearClub();
    expect(await obtenerEvento(otro.id, ev.id)).toBeNull();
  });
});
