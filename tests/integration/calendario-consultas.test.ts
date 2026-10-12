import { beforeEach, describe, expect, it } from "vitest";
import type { Club } from "@prisma/client";
import { calendarioClub, calendarioSocio } from "@/modules/calendario/service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const semana = [dia(2026, 10, 12), dia(2026, 10, 18)] as const; // lunes a domingo

let club: Club;
let natacion: { id: string };
let yoga: { id: string };

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
  natacion = await f.crearActividad(club.id, { nombre: "Natación", horarios: [{ diaSemana: 3, hora: "19:00" }] });
  yoga = await f.crearActividad(club.id, { nombre: "Yoga", horarios: [{ diaSemana: 6, hora: "10:00" }] });
});

describe("calendarioClub", () => {
  it("incluye todas las actividades activas y los eventos del club, no los de otro club", async () => {
    await f.crearActividad(club.id, { nombre: "Cerrada", horarios: [{ diaSemana: 3, hora: "18:00" }], activa: false });
    await f.crearEvento(club.id, { titulo: "Asamblea", fecha: dia(2026, 10, 13), hora: "20:00" });
    const otro = await f.crearClub();
    await f.crearActividad(otro.id, { nombre: "Ajena", horarios: [{ diaSemana: 3, hora: "18:00" }] });
    await f.crearEvento(otro.id, { titulo: "Evento ajeno", fecha: dia(2026, 10, 13) });

    const items = await calendarioClub(club.id, ...semana);
    expect(items.map((i) => [i.titulo, i.fecha.getUTCDate()])).toEqual([
      ["Asamblea", 13],
      ["Natación", 14],
      ["Yoga", 17],
    ]);
  });

  it("trae la clase reprogramada hacia el rango aunque la fecha original esté afuera", async () => {
    await f.crearExcepcion(club.id, natacion.id, {
      fecha: dia(2026, 10, 7), tipo: "REPROGRAMADA", nuevaFecha: dia(2026, 10, 13), nuevaHora: "20:00", motivo: "Lluvia",
    });
    const items = await calendarioClub(club.id, ...semana);
    expect(items.find((i) => i.estado === "REPROGRAMADA")).toMatchObject({
      titulo: "Natación", fecha: dia(2026, 10, 13), fechaOriginal: dia(2026, 10, 7),
    });
  });

  it("arma una clase por cada horario de la actividad dentro de su vigencia", async () => {
    await f.crearActividad(club.id, {
      nombre: "Funcional", horarios: [{ diaSemana: 1, hora: "19:00" }, { diaSemana: 5, hora: "19:00" }], fechaInicio: dia(2026, 10, 13),
    });
    const items = (await calendarioClub(club.id, ...semana)).filter((i) => i.titulo === "Funcional");
    expect(items.map((i) => i.fecha.getUTCDate())).toEqual([16]);
  });

  it("acepta hasta 42 días y rechaza rangos mayores", async () => {
    await expect(calendarioClub(club.id, dia(2026, 9, 28), dia(2026, 11, 8))).resolves.toBeTruthy();
    await expect(calendarioClub(club.id, dia(2026, 9, 28), dia(2026, 11, 9))).rejects.toThrow(
      "El rango máximo es de 6 semanas",
    );
  });
});

describe("calendarioSocio", () => {
  it("muestra solo sus actividades y los eventos del club o de sus actividades", async () => {
    const socio = await f.crearSocio(club.id);
    await f.inscribirDirecto(club.id, natacion.id, socio.id);
    await f.crearEvento(club.id, { titulo: "Asamblea", fecha: dia(2026, 10, 13) });
    await f.crearEvento(club.id, { titulo: "Clínica de natación", fecha: dia(2026, 10, 15), actividadId: natacion.id });
    await f.crearEvento(club.id, { titulo: "Retiro de yoga", fecha: dia(2026, 10, 16), actividadId: yoga.id });

    const items = await calendarioSocio(club.id, socio.id, ...semana);
    expect(items.map((i) => i.titulo)).toEqual(["Asamblea", "Natación", "Clínica de natación"]);
  });
});
