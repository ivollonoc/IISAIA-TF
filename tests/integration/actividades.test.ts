import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Club, TipoSocio } from "@prisma/client";
import { db } from "@/lib/db";
import { mensajeDeError } from "@/lib/errors";
import {
  actividadesParaSocio,
  cambiarEstadoActividad,
  cancelarInscripcion,
  crearActividad,
  editarActividad,
  inscribir,
  listarActividades,
} from "@/modules/actividades/service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const hoy = new Date(Date.UTC(2026, 9, 15, 15)); // jueves 15/10/2026 12:00 en Argentina

let club: Club;
let tipo: TipoSocio;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
  tipo = await f.crearTipo(club.id);
});

const socio = (over: { activo?: boolean } = {}) => f.crearSocio(club.id, { tipoSocioId: tipo.id, ...over });
const form = (over: Record<string, unknown> = {}) => ({
  nombre: "Natación", cupo: "10", fechaInicio: "2026-10-01", dia_1: "on", hora_1: "19:00", dia_3: "on", hora_3: "19:00",
  ...over,
});

describe("crear y listar", () => {
  it("crea la actividad con sus horarios", async () => {
    const a = await crearActividad(club.id, form({ duracion_3: "90", descripcion: "Pileta climatizada" }));
    const guardada = await db.actividad.findUniqueOrThrow({ where: { id: a.id }, include: { horarios: { orderBy: { diaSemana: "asc" } } } });
    expect(guardada).toMatchObject({ nombre: "Natación", cupo: 10, descripcion: "Pileta climatizada", fechaInicio: dia(2026, 10, 1), fechaFin: null });
    expect(guardada.horarios.map((h) => [h.diaSemana, h.hora, h.duracionMin])).toEqual([[1, "19:00", 60], [3, "19:00", 90]]);
  });

  it("lista solo las del club, por nombre, con horarios y cantidad de inscriptos y en espera", async () => {
    await crearActividad(club.id, form({ nombre: "Yoga" }));
    const futbol = await crearActividad(club.id, form({ nombre: "Fútbol" }));
    await f.inscribirDirecto(club.id, futbol.id, (await socio()).id);
    await f.anotarEsperaDirecto(club.id, (await socio()).id, { actividadId: futbol.id });
    await f.crearActividad((await f.crearClub()).id);

    const lista = await listarActividades(club.id);
    expect(lista.map((a) => a.nombre)).toEqual(["Fútbol", "Yoga"]);
    expect(lista[0]._count).toEqual({ inscripciones: 1, listaEspera: 1 });
    expect(lista[0].horarios.map((h) => h.diaSemana)).toEqual([1, 3]);
  });

  it("rechaza un formulario inválido sin crear nada", async () => {
    await expect(crearActividad(club.id, form({ hora_1: "25:00" }))).rejects.toBeInstanceOf(ZodError);
    expect(await db.actividad.count()).toBe(0);
  });
});

describe("editarActividad", () => {
  it("reemplaza horarios y datos", async () => {
    const a = await f.crearActividad(club.id, { horarios: [{ diaSemana: 1, hora: "18:00" }] });
    await editarActividad(club.id, a.id, form({ nombre: "Natación adultos", cupo: "12", dia_1: undefined, hora_1: undefined, dia_5: "on", hora_5: "08:00" }), hoy);
    const r = await db.actividad.findUniqueOrThrow({ where: { id: a.id }, include: { horarios: { orderBy: { diaSemana: "asc" } } } });
    expect(r.nombre).toBe("Natación adultos");
    expect(r.cupo).toBe(12);
    expect(r.horarios.map((h) => [h.diaSemana, h.hora])).toEqual([[3, "19:00"], [5, "08:00"]]);
  });

  it("no deja bajar el cupo por debajo de los inscriptos", async () => {
    const a = await f.crearActividad(club.id, { cupo: 5 });
    await f.inscribirDirecto(club.id, a.id, (await socio()).id);
    await f.inscribirDirecto(club.id, a.id, (await socio()).id);
    await expect(editarActividad(club.id, a.id, form({ cupo: "1" }), hoy)).rejects.toThrow(
      "El cupo no puede ser menor a los inscriptos (2)",
    );
  });

  it("borra las excepciones futuras que quedan fuera de los horarios y conserva el resto", async () => {
    const a = await f.crearActividad(club.id, { horarios: [{ diaSemana: 1, hora: "19:00" }, { diaSemana: 3, hora: "19:00" }] });
    const pasada = await f.crearExcepcion(club.id, a.id, { fecha: dia(2026, 10, 5) }); // lunes pasado
    const futuraLunes = await f.crearExcepcion(club.id, a.id, { fecha: dia(2026, 10, 19) });
    const futuraMiercoles = await f.crearExcepcion(club.id, a.id, { fecha: dia(2026, 10, 21) });

    // Se queda solo con los miércoles.
    const r = await editarActividad(club.id, a.id, form({ dia_1: undefined, hora_1: undefined }), hoy);

    expect(r.excepcionesBorradas).toBe(1);
    const quedan = (await db.excepcionClase.findMany()).map((e) => e.id).sort();
    expect(quedan).toEqual([pasada.id, futuraMiercoles.id].sort());
    expect(quedan).not.toContain(futuraLunes.id);
  });

  it("borra las excepciones futuras posteriores a la nueva fecha de fin", async () => {
    const a = await f.crearActividad(club.id, { horarios: [{ diaSemana: 3, hora: "19:00" }] });
    await f.crearExcepcion(club.id, a.id, { fecha: dia(2026, 10, 28) });
    const r = await editarActividad(club.id, a.id, form({ dia_1: undefined, hora_1: undefined, fechaFin: "2026-10-25" }), hoy);
    expect(r.excepcionesBorradas).toBe(1);
  });

  it("no edita actividades de otro club", async () => {
    const ajena = await f.crearActividad((await f.crearClub()).id);
    await expect(editarActividad(club.id, ajena.id, form(), hoy)).rejects.toThrow("Actividad no encontrada");
  });
});

describe("cambiarEstadoActividad", () => {
  it("desactiva y reactiva solo actividades del club", async () => {
    const a = await f.crearActividad(club.id);
    await cambiarEstadoActividad(club.id, a.id, false);
    expect((await db.actividad.findUniqueOrThrow({ where: { id: a.id } })).activa).toBe(false);
    await cambiarEstadoActividad(club.id, a.id, true);
    expect((await db.actividad.findUniqueOrThrow({ where: { id: a.id } })).activa).toBe(true);
    const ajena = await f.crearActividad((await f.crearClub()).id);
    await expect(cambiarEstadoActividad(club.id, ajena.id, false)).rejects.toThrow("Actividad no encontrada");
  });
});

describe("inscripción", () => {
  it("inscribe a un socio activo", async () => {
    const act = await f.crearActividad(club.id);
    const s = await socio();
    await inscribir(club.id, act.id, s.id, hoy);
    expect(await db.inscripcion.count({ where: { actividadId: act.id, socioId: s.id } })).toBe(1);
  });

  it("rechaza la doble inscripción", async () => {
    const act = await f.crearActividad(club.id);
    const s = await socio();
    await inscribir(club.id, act.id, s.id, hoy);
    await expect(inscribir(club.id, act.id, s.id, hoy)).rejects.toThrow("Ya estás inscripto en esta actividad");
  });

  it("rechaza a un socio inactivo", async () => {
    const act = await f.crearActividad(club.id);
    const s = await socio({ activo: false });
    await expect(inscribir(club.id, act.id, s.id, hoy)).rejects.toThrow("El socio no está activo");
  });

  it("rechaza cuando no hay cupo", async () => {
    const act = await f.crearActividad(club.id, { cupo: 1 });
    await inscribir(club.id, act.id, (await socio()).id, hoy);
    await expect(inscribir(club.id, act.id, (await socio()).id, hoy)).rejects.toThrow("No hay cupo disponible");
  });

  it("rechaza una actividad inactiva o de otro club", async () => {
    const inactiva = await f.crearActividad(club.id, { activa: false });
    await expect(inscribir(club.id, inactiva.id, (await socio()).id, hoy)).rejects.toThrow("Actividad no encontrada");
    const ajena = await f.crearActividad((await f.crearClub()).id);
    await expect(inscribir(club.id, ajena.id, (await socio()).id, hoy)).rejects.toThrow("Actividad no encontrada");
  });

  it("rechaza a un socio de otro club", async () => {
    const act = await f.crearActividad(club.id);
    const ajeno = await f.crearSocio((await f.crearClub()).id);
    await expect(inscribir(club.id, act.id, ajeno.id, hoy)).rejects.toThrow("El socio no está activo");
    expect(await db.inscripcion.count()).toBe(0);
  });

  it("rechaza una actividad que ya finalizó, pero acepta el último día", async () => {
    const terminada = await f.crearActividad(club.id, { fechaFin: dia(2026, 10, 14) });
    await expect(inscribir(club.id, terminada.id, (await socio()).id, hoy)).rejects.toThrow("La actividad ya finalizó");
    const ultimoDia = await f.crearActividad(club.id, { fechaFin: dia(2026, 10, 15) });
    await expect(inscribir(club.id, ultimoDia.id, (await socio()).id, hoy)).resolves.toBeTruthy();
  });

  it("al inscribirse sale de la lista de espera", async () => {
    const act = await f.crearActividad(club.id);
    const s = await socio();
    await f.anotarEsperaDirecto(club.id, s.id, { actividadId: act.id });
    await inscribir(club.id, act.id, s.id, hoy);
    expect(await db.listaEspera.count()).toBe(0);
  });
});

describe("cancelación", () => {
  it("cancela una inscripción e informa si liberó un lugar de una actividad llena", async () => {
    const act = await f.crearActividad(club.id, { cupo: 2 });
    const [a, b] = [await socio(), await socio()];
    await f.inscribirDirecto(club.id, act.id, a.id);
    expect(await cancelarInscripcion(club.id, act.id, a.id, hoy)).toEqual({ liberado: false });
    await f.inscribirDirecto(club.id, act.id, a.id);
    await f.inscribirDirecto(club.id, act.id, b.id);
    expect(await cancelarInscripcion(club.id, act.id, a.id, hoy)).toEqual({ liberado: true });
    expect(await db.inscripcion.count()).toBe(1);
  });

  it("rechaza cancelar sin estar inscripto", async () => {
    const act = await f.crearActividad(club.id);
    await expect(cancelarInscripcion(club.id, act.id, (await socio()).id, hoy)).rejects.toThrow("No estabas inscripto");
  });

  it("no cancela inscripciones usando el clubId de otro club", async () => {
    const otro = await f.crearClub();
    const act = await f.crearActividad(club.id);
    const s = await socio();
    await f.inscribirDirecto(club.id, act.id, s.id);
    await expect(cancelarInscripcion(otro.id, act.id, s.id, hoy)).rejects.toThrow("No estabas inscripto");
    expect(await db.inscripcion.count()).toBe(1);
  });
});

describe("actividadesParaSocio", () => {
  it("lista las activas y vigentes, con inscripción, lista de espera y conteos", async () => {
    const yo = await socio();
    const otroSocio = await socio();
    const llena = await f.crearActividad(club.id, { nombre: "Llena", cupo: 1 });
    const mia = await f.crearActividad(club.id, { nombre: "Mía" });
    await f.crearActividad(club.id, { nombre: "Inactiva", activa: false });
    await f.crearActividad(club.id, { nombre: "Terminada", fechaFin: dia(2026, 10, 1) });
    await f.inscribirDirecto(club.id, mia.id, yo.id);
    await f.inscribirDirecto(club.id, mia.id, otroSocio.id);
    await f.inscribirDirecto(club.id, llena.id, otroSocio.id);
    await f.anotarEsperaDirecto(club.id, yo.id, { actividadId: llena.id });

    const lista = await actividadesParaSocio(club.id, yo.id, hoy);
    expect(lista.map((a) => [a.nombre, a.inscripto, a.enEspera, a.inscriptos])).toEqual([
      ["Llena", false, true, 1],
      ["Mía", true, false, 2],
    ]);
  });
});

describe("concurrencia", () => {
  it("con cupo 1 y 5 inscripciones simultáneas entra exactamente una y ningún rechazo es un error 500", async () => {
    const act = await f.crearActividad(club.id, { cupo: 1 });
    const socios = await Promise.all(Array.from({ length: 5 }, () => socio()));

    const resultados = await Promise.allSettled(socios.map((s) => inscribir(club.id, act.id, s.id, hoy)));

    const exitos = resultados.filter((r) => r.status === "fulfilled");
    const rechazos = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(exitos).toHaveLength(1);
    // "No hay cupo disponible" (DomainError) o conflicto de serialización (P2034): ambos tienen mensaje.
    for (const r of rechazos) expect(mensajeDeError(r.reason), String(r.reason)).not.toBeNull();
    expect(await db.inscripcion.count({ where: { actividadId: act.id } })).toBe(1);
  });
});
