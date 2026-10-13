import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Club, TipoSocio } from "@prisma/client";
import { db } from "@/lib/db";
import { cambiarEstadoActividad, crearActividad, editarActividad, listarActividades } from "@/modules/actividades/service";
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
  nombre: "Natación", cupo: "10", fechaInicio: "2026-10-01", h_0_dia: "1", h_0_hora: "19:00", h_1_dia: "3", h_1_hora: "19:00",
  ...over,
});

describe("crear y listar", () => {
  it("crea la actividad con sus horarios", async () => {
    const a = await crearActividad(club.id, form({ h_1_dur: "90", descripcion: "Pileta climatizada" }));
    const guardada = await db.actividad.findUniqueOrThrow({ where: { id: a.id }, include: { horarios: { orderBy: { diaSemana: "asc" } } } });
    expect(guardada).toMatchObject({ nombre: "Natación", cupo: 10, descripcion: "Pileta climatizada", fechaInicio: dia(2026, 10, 1), fechaFin: null });
    expect(guardada.horarios.map((h) => [h.diaSemana, h.hora, h.duracionMin])).toEqual([[1, "19:00", 60], [3, "19:00", 90]]);
  });

  it("lista solo las del club, por nombre, con horarios y cantidad en espera", async () => {
    await crearActividad(club.id, form({ nombre: "Yoga" }));
    const futbol = await crearActividad(club.id, form({ nombre: "Fútbol", precioClase: "1500" }));
    await f.anotarEsperaDirecto(club.id, (await socio()).id, { actividadId: futbol.id, fecha: dia(2026, 10, 19), hora: "19:00" });
    await f.crearActividad((await f.crearClub()).id);

    const lista = await listarActividades(club.id);
    expect(lista.map((a) => a.nombre)).toEqual(["Fútbol", "Yoga"]);
    expect(lista[0]._count).toEqual({ listaEspera: 1 });
    expect(lista[0].precioClase).toBe(1500);
    expect(lista[0].horarios.map((h) => h.diaSemana)).toEqual([1, 3]);
  });

  it("rechaza un formulario inválido sin crear nada", async () => {
    await expect(crearActividad(club.id, form({ h_0_hora: "25:00" }))).rejects.toBeInstanceOf(ZodError);
    expect(await db.actividad.count()).toBe(0);
  });
});

describe("editarActividad", () => {
  it("reemplaza horarios y datos", async () => {
    const a = await f.crearActividad(club.id, { horarios: [{ diaSemana: 1, hora: "18:00" }] });
    await editarActividad(club.id, a.id, form({ nombre: "Natación adultos", cupo: "12", h_0_dia: undefined, h_0_hora: undefined, h_2_dia: "5", h_2_hora: "08:00" }), hoy);
    const r = await db.actividad.findUniqueOrThrow({ where: { id: a.id }, include: { horarios: { orderBy: { diaSemana: "asc" } } } });
    expect(r.nombre).toBe("Natación adultos");
    expect(r.cupo).toBe(12);
    expect(r.horarios.map((h) => [h.diaSemana, h.hora])).toEqual([[3, "19:00"], [5, "08:00"]]);
  });

  it("no deja bajar el cupo por debajo de las reservas de una clase futura", async () => {
    const a = await f.crearActividad(club.id, { cupo: 5, horarios: [{ diaSemana: 1, hora: "19:00" }] });
    const lunes = { fecha: dia(2026, 10, 19), hora: "19:00" };
    await f.reservarDirecto(club.id, a.id, (await socio()).id, lunes);
    await f.reservarDirecto(club.id, a.id, (await socio()).id, lunes);
    await f.reservarDirecto(club.id, a.id, (await socio()).id, { fecha: dia(2026, 10, 26), hora: "19:00" });
    await expect(editarActividad(club.id, a.id, form({ cupo: "1" }), hoy)).rejects.toThrow(
      "El cupo no puede ser menor a las reservas de una clase (2)",
    );
  });

  it("borra las reservas futuras que quedan sin clase y anula sus cargos", async () => {
    const a = await f.crearActividad(club.id, { horarios: [{ diaSemana: 1, hora: "19:00" }, { diaSemana: 3, hora: "19:00" }] });
    const s = await socio();
    const lunes = await f.reservarDirecto(club.id, a.id, s.id, { fecha: dia(2026, 10, 19), hora: "19:00" });
    const miercoles = await f.reservarDirecto(club.id, a.id, s.id, { fecha: dia(2026, 10, 21), hora: "19:00" });
    await f.crearCargo(club.id, s.id, { concepto: "CLASE", clave: `CLA:${a.id}:2026-10-19:19:00` });

    // Se queda solo con los miércoles.
    const r = await editarActividad(club.id, a.id, form({ h_0_dia: undefined, h_0_hora: undefined }), hoy);
    expect(r.reservasBorradas).toBe(1);
    expect((await db.reserva.findMany()).map((x) => x.id)).toEqual([miercoles.id]);
    expect(lunes.id).toBeDefined();
    expect(await db.cargo.findFirstOrThrow()).toMatchObject({ estado: "ANULADO", motivoAnulacion: "La clase ya no existe" });
  });

  it("borra las excepciones futuras que quedan fuera de los horarios y conserva el resto", async () => {
    const a = await f.crearActividad(club.id, { horarios: [{ diaSemana: 1, hora: "19:00" }, { diaSemana: 3, hora: "19:00" }] });
    const pasada = await f.crearExcepcion(club.id, a.id, { fecha: dia(2026, 10, 5) }); // lunes pasado
    const futuraLunes = await f.crearExcepcion(club.id, a.id, { fecha: dia(2026, 10, 19) });
    const futuraMiercoles = await f.crearExcepcion(club.id, a.id, { fecha: dia(2026, 10, 21) });

    // Se queda solo con los miércoles.
    const r = await editarActividad(club.id, a.id, form({ h_0_dia: undefined, h_0_hora: undefined }), hoy);

    expect(r.excepcionesBorradas).toBe(1);
    const quedan = (await db.excepcionClase.findMany()).map((e) => e.id).sort();
    expect(quedan).toEqual([pasada.id, futuraMiercoles.id].sort());
    expect(quedan).not.toContain(futuraLunes.id);
  });

  it("con dos horarios el mismo día, cambiar uno solo borra la excepción de esa hora", async () => {
    const a = await f.crearActividad(club.id, { horarios: [{ diaSemana: 1, hora: "09:00" }, { diaSemana: 1, hora: "19:00" }] });
    const maniana = await f.crearExcepcion(club.id, a.id, { fecha: dia(2026, 10, 19), hora: "09:00" });
    await f.crearExcepcion(club.id, a.id, { fecha: dia(2026, 10, 19), hora: "19:00" });
    // Queda lunes 9:00 y el de 19:00 pasa a 20:00.
    const r = await editarActividad(
      club.id, a.id, form({ h_0_dia: "1", h_0_hora: "09:00", h_1_dia: "1", h_1_hora: "20:00" }), hoy,
    );
    expect(r.excepcionesBorradas).toBe(1);
    expect((await db.excepcionClase.findMany()).map((e) => e.id)).toEqual([maniana.id]);
  });

  it("borra las excepciones futuras posteriores a la nueva fecha de fin", async () => {
    const a = await f.crearActividad(club.id, { horarios: [{ diaSemana: 3, hora: "19:00" }] });
    await f.crearExcepcion(club.id, a.id, { fecha: dia(2026, 10, 28) });
    const r = await editarActividad(club.id, a.id, form({ h_0_dia: undefined, h_0_hora: undefined, fechaFin: "2026-10-25" }), hoy);
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
