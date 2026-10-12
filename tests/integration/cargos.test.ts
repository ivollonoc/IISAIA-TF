import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Club } from "@prisma/client";
import { db } from "@/lib/db";
import { actualizarConfigClub } from "@/modules/clubs/service";
import { anularCargo, generarCargosPeriodo } from "@/modules/cuenta-corriente/cargos.service";
import { cuentaClub } from "@/modules/cuenta-corriente/consultas.service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const hoy = new Date(2026, 9, 15, 12); // 15/10/2026

let club: Club;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub({ diaVencimiento: 10 });
});

describe("generarCargosPeriodo", () => {
  it("crea la cuota de cada socio activo y el arancel de sus actividades pagas activas", async () => {
    const tipo = await f.crearTipo(club.id, { cuotaMensual: 15000 });
    const socio = await f.crearSocio(club.id, { tipoSocioId: tipo.id });
    const natacion = await f.crearActividad(club.id, { nombre: "Natación", arancel: 5000 });
    await f.inscribirDirecto(club.id, natacion.id, socio.id);

    expect(await generarCargosPeriodo(club.id, { periodo: "2026-10" }, hoy)).toEqual({ creados: 2, existentes: 0 });
    const cargos = await db.cargo.findMany({ where: { socioId: socio.id }, orderBy: { monto: "desc" } });
    expect(cargos.map((c) => [c.clave, c.descripcion, c.monto, c.estado])).toEqual([
      ["CUOTA", "Cuota social 2026-10", 15000, "PENDIENTE"],
      [`ACT:${natacion.id}`, "Natación 2026-10", 5000, "PENDIENTE"],
    ]);
    expect(cargos.every((c) => c.vencimiento.getTime() === utc(2026, 10, 10).getTime())).toBe(true);
  });

  it("omite socios inactivos, cuotas en $0, actividades gratuitas o inactivas y socios de otro club", async () => {
    const gratis = await f.crearTipo(club.id, { cuotaMensual: 0 });
    const socioGratis = await f.crearSocio(club.id, { tipoSocioId: gratis.id });
    await f.crearSocio(club.id, { activo: false });
    const yoga = await f.crearActividad(club.id, { arancel: 0 });
    const cerrada = await f.crearActividad(club.id, { arancel: 4000, activa: false });
    await f.inscribirDirecto(club.id, yoga.id, socioGratis.id);
    await f.inscribirDirecto(club.id, cerrada.id, socioGratis.id);
    const otro = await f.crearClub();
    await f.crearSocio(otro.id);

    expect(await generarCargosPeriodo(club.id, { periodo: "2026-10" }, hoy)).toEqual({ creados: 0, existentes: 0 });
    expect(await db.cargo.count()).toBe(0);
  });

  it("es idempotente: la segunda corrida no crea nada", async () => {
    await f.crearSocio(club.id);
    await f.crearSocio(club.id);
    await generarCargosPeriodo(club.id, { periodo: "2026-10" }, hoy);
    expect(await generarCargosPeriodo(club.id, { periodo: "2026-10" }, hoy)).toEqual({ creados: 0, existentes: 2 });
    expect(await db.cargo.count()).toBe(2);
  });

  it("dos corridas simultáneas no duplican cargos", async () => {
    for (let i = 0; i < 5; i++) await f.crearSocio(club.id);
    const [a, b] = await Promise.all([
      generarCargosPeriodo(club.id, { periodo: "2026-10" }, hoy),
      generarCargosPeriodo(club.id, { periodo: "2026-10" }, hoy),
    ]);
    expect(a.creados + b.creados).toBe(5);
    expect(await db.cargo.count()).toBe(5);
  });

  it("solo acepta el período actual o el siguiente", async () => {
    await expect(generarCargosPeriodo(club.id, { periodo: "2026-09" }, hoy)).rejects.toThrow(
      "Solo se pueden generar cargos del mes actual o del siguiente",
    );
    await expect(generarCargosPeriodo(club.id, { periodo: "2026-12" }, hoy)).rejects.toThrow(
      "Solo se pueden generar cargos del mes actual o del siguiente",
    );
    await expect(generarCargosPeriodo(club.id, { periodo: "2026-11" }, hoy)).resolves.toBeTruthy();
  });

  it("usa el día de vencimiento del club", async () => {
    await actualizarConfigClub(club.id, { diaVencimiento: "5" });
    const socio = await f.crearSocio(club.id);
    await generarCargosPeriodo(club.id, { periodo: "2026-11" }, hoy);
    const [cargo] = await db.cargo.findMany({ where: { socioId: socio.id } });
    expect(cargo.vencimiento).toEqual(utc(2026, 11, 5));
  });
});

describe("anularCargo", () => {
  it("anula un pendiente guardando el motivo", async () => {
    const socio = await f.crearSocio(club.id);
    const c = await f.crearCargo(club.id, socio.id);
    await anularCargo(club.id, c.id, { motivo: "Cargado por error" });
    expect(await db.cargo.findUnique({ where: { id: c.id } })).toMatchObject({
      estado: "ANULADO",
      motivoAnulacion: "Cargado por error",
    });
  });

  it("exige motivo", async () => {
    const socio = await f.crearSocio(club.id);
    const c = await f.crearCargo(club.id, socio.id);
    await expect(anularCargo(club.id, c.id, { motivo: "" })).rejects.toBeInstanceOf(ZodError);
  });

  it("no anula cargos pagados", async () => {
    const socio = await f.crearSocio(club.id);
    const c = await f.crearCargo(club.id, socio.id, { estado: "PAGADO" });
    await expect(anularCargo(club.id, c.id, { motivo: "Error" })).rejects.toThrow(
      "Solo se pueden anular cargos pendientes",
    );
  });

  it("no anula cargos de otro club", async () => {
    const otro = await f.crearClub();
    const ajeno = await f.crearSocio(otro.id);
    const c = await f.crearCargo(otro.id, ajeno.id);
    await expect(anularCargo(club.id, c.id, { motivo: "Error" })).rejects.toThrow("Cargo no encontrado");
    expect((await db.cargo.findUnique({ where: { id: c.id } }))?.estado).toBe("PENDIENTE");
  });
});

describe("cuentaClub", () => {
  it("resume lo cobrado en el mes por medio, la deuda y las acreditaciones, solo del club", async () => {
    const socio = await f.crearSocio(club.id, { nombre: "Ana" });
    await f.crearPagoDirecto(club.id, socio.id, { monto: 15000, medio: "ONLINE", fecha: new Date(2026, 9, 5) });
    await f.crearPagoDirecto(club.id, socio.id, { monto: 8000, medio: "EFECTIVO", fecha: new Date(2026, 9, 7) });
    await f.crearPagoDirecto(club.id, socio.id, { monto: 1000, fecha: new Date(2026, 8, 28) }); // mes anterior
    await f.crearCargo(club.id, socio.id, { monto: 5000, vencimiento: utc(2026, 10, 20) });
    await f.crearCargo(club.id, socio.id, { monto: 3000, vencimiento: utc(2026, 9, 10) });
    await db.intentoPago.create({
      data: { clubId: club.id, socioId: socio.id, cargoIds: [], monto: 1, estado: "APROBADO", pasarela: "simulada" },
    });
    await db.intentoPago.create({
      data: { clubId: club.id, socioId: socio.id, cargoIds: [], monto: 1, estado: "RECHAZADO", pasarela: "simulada" },
    });
    const otro = await f.crearClub();
    const ajeno = await f.crearSocio(otro.id);
    await f.crearPagoDirecto(otro.id, ajeno.id, { monto: 99999, fecha: new Date(2026, 9, 5) });

    const c = await cuentaClub(club.id, hoy);
    expect(c).toMatchObject({
      periodo: "2026-10",
      cobrado: 23000,
      cobradoOnline: 15000,
      cobradoVentanilla: 8000,
      deudaPendiente: 8000,
      deudaVencida: 3000,
      intentosSinPago: 1,
    });
    expect(c.acreditaciones.map((p) => [p.monto, p.socio.nombre])).toEqual([
      [8000, "Ana"],
      [15000, "Ana"],
    ]);
  });
});

describe("actualizarConfigClub", () => {
  it("rechaza días fuera de 1..28", async () => {
    // actualizarConfigClub no es async: la validación lanza sincrónicamente.
    await expect((async () => actualizarConfigClub(club.id, { diaVencimiento: 29 }))()).rejects.toBeInstanceOf(ZodError);
  });
});
