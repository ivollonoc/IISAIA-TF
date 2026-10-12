import { beforeEach, describe, expect, it } from "vitest";
import type { Club, Socio } from "@prisma/client";
import { cuentaSocio, estadoSocios, resumenClub } from "@/modules/cuenta-corriente/consultas.service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const hoy = new Date(2026, 9, 15, 12); // 15/10/2026

let club: Club;
let socio: Socio;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
  socio = await f.crearSocio(club.id);
});

describe("cuentaSocio", () => {
  it("arma los movimientos con saldo, la deuda, lo vencido y el próximo vencimiento", async () => {
    await f.crearCargo(club.id, socio.id, {
      descripcion: "Cuota social 2026-09",
      monto: 15000,
      vencimiento: utc(2026, 9, 10),
      createdAt: new Date(2026, 8, 1),
    });
    const pago = await f.crearPagoDirecto(club.id, socio.id, { monto: 8000, fecha: new Date(2026, 8, 5) });
    await f.crearCargo(club.id, socio.id, {
      descripcion: "Natación 2026-09",
      monto: 8000,
      estado: "PAGADO",
      pagoId: pago.id,
      createdAt: new Date(2026, 8, 2),
    });
    await f.crearCargo(club.id, socio.id, {
      descripcion: "Anulado",
      monto: 3000,
      estado: "ANULADO",
      createdAt: new Date(2026, 9, 1),
    });
    await f.crearCargo(club.id, socio.id, {
      descripcion: "Cuota social 2026-10",
      monto: 5000,
      vencimiento: utc(2026, 10, 20),
      createdAt: new Date(2026, 9, 2),
    });

    const c = await cuentaSocio(club.id, socio.id, hoy);
    expect(c.movimientos.map((m) => [m.concepto, m.saldo])).toEqual([
      ["Cuota social 2026-09", 15000],
      ["Natación 2026-09", 23000],
      ["Pago (efectivo)", 15000],
      ["Anulado", 15000],
      ["Cuota social 2026-10", 20000],
    ]);
    expect(c.deuda).toBe(20000);
    expect(c.deudaVencida).toBe(15000);
    expect(c.proximoVencimiento).toEqual(utc(2026, 10, 20));
    expect(c.alDia).toBe(false);
    expect(c.pendientes.map((p) => [p.descripcion, p.vencido])).toEqual([
      ["Cuota social 2026-09", true],
      ["Cuota social 2026-10", false],
    ]);
  });

  it("sin cargos está al día y sin deuda", async () => {
    const c = await cuentaSocio(club.id, socio.id, hoy);
    expect(c).toMatchObject({ movimientos: [], deuda: 0, deudaVencida: 0, proximoVencimiento: null, alDia: true });
  });

  it("no muestra la cuenta de un socio de otro club", async () => {
    const otro = await f.crearClub();
    await expect(cuentaSocio(otro.id, socio.id, hoy)).rejects.toThrow("Socio no encontrado");
  });
});

describe("estadoSocios", () => {
  it("devuelve deuda y morosidad por socio, solo del club", async () => {
    const alDiaConDeuda = await f.crearSocio(club.id);
    const sinCargos = await f.crearSocio(club.id);
    await f.crearCargo(club.id, socio.id, { monto: 15000, vencimiento: utc(2026, 9, 10) });
    await f.crearCargo(club.id, alDiaConDeuda.id, { monto: 5000, vencimiento: utc(2026, 10, 20) });
    const otro = await f.crearClub();
    const ajeno = await f.crearSocio(otro.id);
    await f.crearCargo(otro.id, ajeno.id, { vencimiento: utc(2026, 9, 10) });

    const e = await estadoSocios(club.id, hoy);
    expect(e[socio.id]).toEqual({ deuda: 15000, moroso: true });
    expect(e[alDiaConDeuda.id]).toEqual({ deuda: 5000, moroso: false });
    expect(e[sinCargos.id]).toBeUndefined();
    expect(e[ajeno.id]).toBeUndefined();
  });

  it("un socio dado de baja no figura como moroso, pero su deuda se informa", async () => {
    const baja = await f.crearSocio(club.id, { activo: false });
    await f.crearCargo(club.id, baja.id, { monto: 7000, vencimiento: utc(2026, 9, 10) });
    expect((await estadoSocios(club.id, hoy))[baja.id]).toEqual({ deuda: 7000, moroso: false });
  });
});

describe("resumenClub", () => {
  it("cuenta morosos entre activos, suma la deuda vencida (incluida la de bajas) y lo cobrado en el mes", async () => {
    const alDia = await f.crearSocio(club.id);
    const baja = await f.crearSocio(club.id, { activo: false });
    await f.crearCargo(club.id, socio.id, { monto: 15000, vencimiento: utc(2026, 9, 10) }); // moroso
    await f.crearCargo(club.id, alDia.id, { monto: 5000, vencimiento: utc(2026, 10, 20) }); // no vencido
    await f.crearCargo(club.id, baja.id, { monto: 7000, vencimiento: utc(2026, 9, 10) }); // vencido de una baja
    await f.crearPagoDirecto(club.id, alDia.id, { monto: 9000, fecha: new Date(2026, 9, 3) });
    await f.crearPagoDirecto(club.id, alDia.id, { monto: 1000, fecha: new Date(2026, 8, 30) }); // mes anterior
    await f.crearActividad(club.id);
    await f.crearActividad(club.id, { activa: false });
    const otro = await f.crearClub();
    const ajeno = await f.crearSocio(otro.id);
    await f.crearPagoDirecto(otro.id, ajeno.id, { monto: 99999, fecha: new Date(2026, 9, 3) });

    expect(await resumenClub(club.id, hoy)).toEqual({
      periodo: "2026-10",
      activos: 2,
      alDia: 1,
      morosos: 1,
      deudaVencida: 22000,
      recaudado: 9000,
      actividades: 1,
    });
  });
});
