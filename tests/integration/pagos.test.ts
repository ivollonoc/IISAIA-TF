import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Club } from "@prisma/client";
import { db } from "@/lib/db";
import { periodoActual } from "@/lib/periodo";
import { registrarPago, resumenClub } from "@/server/pagos";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

let club: Club;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
});

const pago = (socioId: string, over: Record<string, string> = {}) => ({
  socioId,
  periodo: "2026-10",
  monto: "15000",
  medio: "EFECTIVO",
  ...over,
});

describe("registrarPago", () => {
  it("registra el pago del período", async () => {
    const s = await f.crearSocio(club.id);
    const p = await registrarPago(club.id, pago(s.id));
    expect(p).toMatchObject({ clubId: club.id, socioId: s.id, periodo: "2026-10", monto: 15000, medio: "EFECTIVO" });
  });

  it("rechaza un segundo pago del mismo período", async () => {
    const s = await f.crearSocio(club.id);
    await registrarPago(club.id, pago(s.id));
    await expect(registrarPago(club.id, pago(s.id, { medio: "TRANSFERENCIA" }))).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("permite pagar otro período", async () => {
    const s = await f.crearSocio(club.id);
    await registrarPago(club.id, pago(s.id));
    await expect(registrarPago(club.id, pago(s.id, { periodo: "2026-11" }))).resolves.toBeTruthy();
  });

  it("rechaza un socio de otro club", async () => {
    const otro = await f.crearClub();
    const s = await f.crearSocio(otro.id);
    await expect(registrarPago(club.id, pago(s.id))).rejects.toThrow("Socio no encontrado");
    expect(await db.pago.count()).toBe(0);
  });

  it("rechaza un período mal formado", async () => {
    const s = await f.crearSocio(club.id);
    await expect(registrarPago(club.id, pago(s.id, { periodo: "2026-13" }))).rejects.toBeInstanceOf(ZodError);
  });
});

describe("resumenClub", () => {
  it("cuenta activos, al día, morosos, recaudado del período y actividades activas, solo del club", async () => {
    const periodo = periodoActual();
    const hoy = new Date();
    const anterior = periodoActual(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 15));

    const s1 = await f.crearSocio(club.id);
    const s2 = await f.crearSocio(club.id);
    const s3 = await f.crearSocio(club.id);
    const inactivo = await f.crearSocio(club.id, { activo: false });
    await f.crearPagoDirecto(club.id, s1.id, { periodo, monto: 15000 });
    await f.crearPagoDirecto(club.id, s2.id, { periodo, monto: 8000 });
    await f.crearPagoDirecto(club.id, s3.id, { periodo: anterior, monto: 15000 });
    await f.crearPagoDirecto(club.id, inactivo.id, { periodo, monto: 5000 });
    await f.crearActividad(club.id);
    await f.crearActividad(club.id);
    await f.crearActividad(club.id, { activa: false });

    const otro = await f.crearClub();
    const ajeno = await f.crearSocio(otro.id);
    await f.crearPagoDirecto(otro.id, ajeno.id, { periodo, monto: 99999 });
    await f.crearActividad(otro.id);

    // recaudado suma todos los pagos del período del club, incluido el del socio inactivo (comportamiento v1).
    expect(await resumenClub(club.id)).toEqual({
      periodo,
      activos: 3,
      alDia: 2,
      morosos: 1,
      recaudado: 28000,
      actividades: 2,
    });
  });

  it("con el club vacío devuelve ceros", async () => {
    expect(await resumenClub(club.id)).toMatchObject({ activos: 0, alDia: 0, morosos: 0, recaudado: 0, actividades: 0 });
  });
});
