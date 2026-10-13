import { beforeEach, describe, expect, it } from "vitest";
import type { Club } from "@prisma/client";
import { db } from "@/lib/db";
import { puntajesDeActividad, puntuar } from "@/modules/actividades/puntajes.service";
import { reporteClub, reporteGlobal } from "@/modules/reportes/service";
import { cambiarEstadoSocio } from "@/modules/socios/service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const hoy = new Date(Date.UTC(2026, 9, 15, 15)); // jueves 15/10/2026

let club: Club;
beforeEach(async () => {
  await resetDb();
  club = await f.crearClub({ diaVencimiento: 10 });
});

describe("puntajes", () => {
  it("un socio que fue a la actividad la puntúa en medias estrellas y puede cambiar su puntaje", async () => {
    const act = await f.crearActividad(club.id, { nombre: "Yoga" });
    const s = await f.crearSocio(club.id, { nombre: "Ana" });
    await f.reservarDirecto(club.id, act.id, s.id, { fecha: dia(2026, 10, 12), hora: "18:00" });

    await puntuar(club.id, s.id, { actividadId: act.id, estrellas: "4.5", comentario: "Muy buena" }, hoy);
    expect(await db.puntaje.findFirstOrThrow()).toMatchObject({ medias: 9, comentario: "Muy buena" });
    await puntuar(club.id, s.id, { actividadId: act.id, estrellas: "3", comentario: "" }, hoy);
    expect(await db.puntaje.findFirstOrThrow()).toMatchObject({ medias: 6, comentario: null });
    expect(await db.puntaje.count()).toBe(1);
  });

  it("solo puntúa quien ya fue a una clase y con valores de 0,5 a 5 en pasos de media", async () => {
    const act = await f.crearActividad(club.id);
    const s = await f.crearSocio(club.id);
    await expect(puntuar(club.id, s.id, { actividadId: act.id, estrellas: "4" }, hoy)).rejects.toThrow(
      "Podés puntuar las actividades a las que ya fuiste",
    );
    await f.reservarDirecto(club.id, act.id, s.id, { fecha: dia(2026, 10, 19), hora: "18:00" }); // futura
    await expect(puntuar(club.id, s.id, { actividadId: act.id, estrellas: "4" }, hoy)).rejects.toThrow(
      "Podés puntuar las actividades a las que ya fuiste",
    );
    await f.reservarDirecto(club.id, act.id, s.id, { fecha: dia(2026, 10, 12), hora: "18:00" });
    for (const malo of ["0", "5.5", "4.3", "x"]) {
      await expect(puntuar(club.id, s.id, { actividadId: act.id, estrellas: malo }, hoy)).rejects.toThrow();
    }
  });

  it("puntajesDeActividad da promedio (en estrellas), votos y comentarios", async () => {
    const act = await f.crearActividad(club.id);
    for (const [nombre, estrellas, comentario] of [["Ana", "5", "Excelente"], ["Beto", "4", ""], ["Caro", "3.5", "Bien"]] as const) {
      const s = await f.crearSocio(club.id, { nombre });
      await f.reservarDirecto(club.id, act.id, s.id, { fecha: dia(2026, 10, 12), hora: "18:00" });
      await puntuar(club.id, s.id, { actividadId: act.id, estrellas, comentario }, hoy);
    }
    const r = await puntajesDeActividad(club.id, act.id);
    expect(r.promedio).toBe(4.2);
    expect(r.votos).toBe(3);
    expect(r.comentarios.map((c) => [c.socio, c.estrellas, c.comentario]).sort()).toEqual([
      ["Ana", 5, "Excelente"],
      ["Caro", 3.5, "Bien"],
    ]);
  });
});

describe("reporteClub", () => {
  it("recaudación por mes: emitido (sin anulados) contra cobrado", async () => {
    const s = await f.crearSocio(club.id);
    await f.crearCargo(club.id, s.id, { periodo: "2026-09", monto: 10000 });
    await f.crearCargo(club.id, s.id, { periodo: "2026-10", monto: 12000 });
    await f.crearCargo(club.id, s.id, { periodo: "2026-10", monto: 999, estado: "ANULADO" });
    await f.crearPagoDirecto(club.id, s.id, { monto: 10000, fecha: new Date(Date.UTC(2026, 8, 5, 15)) });
    await f.crearPagoDirecto(club.id, s.id, { monto: 4000, fecha: new Date(Date.UTC(2026, 9, 3, 15)) });
    await f.crearCargo((await f.crearClub()).id, (await f.crearSocio(club.id)).id, { periodo: "2026-10", monto: 1 });

    const r = await reporteClub(club.id, 6, hoy);
    expect(r.recaudacion.map((m) => m.periodo)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(r.recaudacion.slice(-2)).toEqual([
      { periodo: "2026-09", emitido: 10000, cobrado: 10000 },
      { periodo: "2026-10", emitido: 12000, cobrado: 4000 },
    ]);
    expect(r.kpis.recaudadoMes).toBe(4000);
  });

  it("morosos: socios activos con deuda vencida, de mayor a menor", async () => {
    const [a, b, c] = [await f.crearSocio(club.id, { nombre: "Ana" }), await f.crearSocio(club.id, { nombre: "Beto" }), await f.crearSocio(club.id, { nombre: "Caro" })];
    await f.crearCargo(club.id, a.id, { monto: 5000, vencimiento: dia(2026, 10, 10) });
    await f.crearCargo(club.id, b.id, { monto: 9000, vencimiento: dia(2026, 10, 10) });
    await f.crearCargo(club.id, c.id, { monto: 7000, vencimiento: dia(2026, 10, 20) }); // no vencido
    const r = await reporteClub(club.id, 6, hoy);
    expect(r.morosos.map((m) => [m.nombre, m.deudaVencida])).toEqual([["Beto", 9000], ["Ana", 5000]]);
    expect(r.kpis).toMatchObject({ activos: 3, deudaVencida: 14000, porcentajeAlDia: 33 });
  });

  it("ocupación de las últimas 4 semanas por actividad (reservas sobre lugares, sin clases suspendidas)", async () => {
    // Lunes 18:00, cupo 2: lunes 21/9, 28/9, 5/10 y 12/10 (4 clases), una suspendida → 3 clases, 6 lugares.
    const act = await f.crearActividad(club.id, { nombre: "Fútbol", cupo: 2 });
    await f.crearExcepcion(club.id, act.id, { fecha: dia(2026, 10, 5), hora: "18:00" });
    const s = await f.crearSocio(club.id);
    await f.reservarDirecto(club.id, act.id, s.id, { fecha: dia(2026, 9, 28), hora: "18:00" });
    await f.reservarDirecto(club.id, act.id, (await f.crearSocio(club.id)).id, { fecha: dia(2026, 9, 28), hora: "18:00" });
    await f.reservarDirecto(club.id, act.id, s.id, { fecha: dia(2026, 10, 12), hora: "18:00" });
    await f.reservarDirecto(club.id, act.id, s.id, { fecha: dia(2026, 10, 19), hora: "18:00" }); // futura: no cuenta
    await f.anotarEsperaDirecto(club.id, (await f.crearSocio(club.id)).id, { actividadId: act.id, fecha: dia(2026, 10, 19), hora: "18:00" });

    const [o] = (await reporteClub(club.id, 6, hoy)).ocupacion;
    expect(o).toMatchObject({ actividad: "Fútbol", clases: 3, lugares: 6, reservas: 3, porcentaje: 50, enEspera: 1 });
  });

  it("altas y bajas por mes", async () => {
    await f.crearSocio(club.id);
    const s = await f.crearSocio(club.id);
    await db.socio.updateMany({ data: { createdAt: new Date(Date.UTC(2026, 8, 10, 15)) } });
    await cambiarEstadoSocio(club.id, s.id, false);
    await db.socio.update({ where: { id: s.id }, data: { bajaAt: new Date(Date.UTC(2026, 9, 2, 15)) } });

    const r = await reporteClub(club.id, 6, hoy);
    expect(r.altasBajas.slice(-2)).toEqual([
      { periodo: "2026-09", altas: 2, bajas: 0 },
      { periodo: "2026-10", altas: 0, bajas: 1 },
    ]);
  });
});

describe("cambiarEstadoSocio", () => {
  it("guarda la fecha de baja y la borra al reactivar", async () => {
    const s = await f.crearSocio(club.id);
    await cambiarEstadoSocio(club.id, s.id, false);
    expect((await db.socio.findUniqueOrThrow({ where: { id: s.id } })).bajaAt).not.toBeNull();
    await cambiarEstadoSocio(club.id, s.id, true);
    expect((await db.socio.findUniqueOrThrow({ where: { id: s.id } })).bajaAt).toBeNull();
  });
});

describe("reporteGlobal", () => {
  it("resume clubes sin información financiera", async () => {
    const otro = await f.crearClub({ nombre: "Club B" });
    await f.crearSocio(club.id);
    await f.crearSocio(club.id, { activo: false });
    await f.crearSocio(otro.id);
    await f.crearActividad(club.id);
    const r = await reporteGlobal(6, hoy);
    expect(r.totales).toMatchObject({ clubes: 2, sociosActivos: 2, actividades: 1 });
    expect(r.clubes.find((c) => c.nombre === "Club B")).toMatchObject({ sociosActivos: 1, actividades: 0 });
    expect(JSON.stringify(r)).not.toMatch(/monto|cobrado|deuda/i);
  });
});
