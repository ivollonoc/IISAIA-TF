import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Club, Socio } from "@prisma/client";
import { db } from "@/lib/db";
import { registrarPago } from "@/modules/cuenta-corriente/pagos.service";
import { pagarOnline, prepararCheckout } from "@/modules/pagos-online/checkout.service";
import type { Pasarela } from "@/modules/pagos-online/pasarela";
import { pasarelaSimulada } from "@/modules/pagos-online/simulada";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const tarjeta = (numero = "4000 0000 0000 0001") => ({ numero, vencimiento: "12/30", cvv: "123", titular: "Lucía Gómez" });

let club: Club;
let socio: Socio;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
  socio = await f.crearSocio(club.id);
});

describe("prepararCheckout", () => {
  it("devuelve los cargos pendientes elegidos y el total", async () => {
    const c1 = await f.crearCargo(club.id, socio.id, { monto: 15000 });
    const c2 = await f.crearCargo(club.id, socio.id, { monto: 5000 });
    const r = await prepararCheckout(club.id, socio.id, [c1.id, c2.id]);
    expect(r.total).toBe(20000);
    expect(r.cargos).toHaveLength(2);
  });

  it("sin cargos pide elegir al menos uno", async () => {
    await expect(prepararCheckout(club.id, socio.id, [])).rejects.toThrow("Elegí al menos un cargo");
  });

  it("rechaza cargos de otro socio o ya pagados", async () => {
    const otro = await f.crearSocio(club.id);
    const ajeno = await f.crearCargo(club.id, otro.id);
    const pagado = await f.crearCargo(club.id, socio.id, { estado: "PAGADO" });
    await expect(prepararCheckout(club.id, socio.id, [ajeno.id])).rejects.toThrow(
      "Alguno de los cargos ya fue pagado o anulado",
    );
    await expect(prepararCheckout(club.id, socio.id, [pagado.id])).rejects.toThrow(
      "Alguno de los cargos ya fue pagado o anulado",
    );
  });
});

describe("pagarOnline", () => {
  it("aprobado: paga los cargos (ONLINE), vincula el intento y guarda solo los últimos 4 dígitos", async () => {
    const c1 = await f.crearCargo(club.id, socio.id, { monto: 15000 });
    const c2 = await f.crearCargo(club.id, socio.id, { monto: 5000 });
    // `monto` en los datos del formulario se ignora: el total se calcula en el servidor.
    const r = await pagarOnline(club.id, socio.id, [c1.id, c2.id], { ...tarjeta(), monto: "1" }, pasarelaSimulada);
    expect(r.estado).toBe("APROBADO");

    const pago = await db.pago.findFirstOrThrow();
    expect(pago).toMatchObject({ monto: 20000, medio: "ONLINE", registradoPor: null });
    expect(await db.cargo.count({ where: { estado: "PAGADO", pagoId: pago.id } })).toBe(2);
    const intento = await db.intentoPago.findFirstOrThrow();
    expect(intento).toMatchObject({ estado: "APROBADO", pagoId: pago.id, ultimos4: "0001", monto: 20000, pasarela: "simulada" });
    expect(intento.referenciaExterna).toBe(`SIM-${intento.id}`);
  });

  it("rechazado: guarda el intento con el motivo y la deuda queda intacta", async () => {
    const c = await f.crearCargo(club.id, socio.id);
    const r = await pagarOnline(club.id, socio.id, [c.id], tarjeta("4000 0000 0000 0002"), pasarelaSimulada);
    expect(r).toMatchObject({ estado: "RECHAZADO", motivo: "Fondos insuficientes" });
    expect(await db.intentoPago.findFirstOrThrow()).toMatchObject({ estado: "RECHAZADO", motivoRechazo: "Fondos insuficientes", pagoId: null });
    expect((await db.cargo.findUnique({ where: { id: c.id } }))?.estado).toBe("PENDIENTE");
    expect(await db.pago.count()).toBe(0);
  });

  it("si la pasarela falla, el intento queda rechazado por error de la pasarela", async () => {
    const rota: Pasarela = {
      nombre: "rota",
      async cobrar() {
        throw new Error("timeout");
      },
    };
    const c = await f.crearCargo(club.id, socio.id);
    const r = await pagarOnline(club.id, socio.id, [c.id], tarjeta(), rota);
    expect(r).toMatchObject({ estado: "RECHAZADO", motivo: "Error de la pasarela" });
    expect((await db.cargo.findUnique({ where: { id: c.id } }))?.estado).toBe("PENDIENTE");
  });

  it("pendiente (pasarela asincrónica): el intento queda pendiente y la deuda intacta", async () => {
    const asincronica: Pasarela = {
      nombre: "async",
      async cobrar() {
        return { estado: "PENDIENTE", referencia: "PREF-1", redirectUrl: "https://pasarela/pagar" };
      },
    };
    const c = await f.crearCargo(club.id, socio.id);
    const r = await pagarOnline(club.id, socio.id, [c.id], tarjeta(), asincronica);
    expect(r).toMatchObject({ estado: "PENDIENTE", redirectUrl: "https://pasarela/pagar" });
    expect(await db.intentoPago.findFirstOrThrow()).toMatchObject({ estado: "PENDIENTE", referenciaExterna: "PREF-1" });
    expect((await db.cargo.findUnique({ where: { id: c.id } }))?.estado).toBe("PENDIENTE");
  });

  it("aprobado pero el cargo se pagó en ventanilla mientras tanto: intento aprobado sin pago, a revisar", async () => {
    const c = await f.crearCargo(club.id, socio.id);
    const conCarrera: Pasarela = {
      nombre: "carrera",
      async cobrar() {
        await registrarPago(club.id, { socioId: socio.id, cargoIds: [c.id], medio: "EFECTIVO" });
        return { estado: "APROBADO", referencia: "R-1" };
      },
    };
    const r = await pagarOnline(club.id, socio.id, [c.id], tarjeta(), conCarrera);
    expect(r).toMatchObject({ estado: "REQUIERE_REVISION", motivo: "Alguno de los cargos ya fue pagado o anulado" });
    expect(await db.intentoPago.findFirstOrThrow()).toMatchObject({ estado: "APROBADO", pagoId: null, referenciaExterna: "R-1" });
    expect(await db.pago.count()).toBe(1); // solo el de ventanilla
  });

  it("tarjeta inválida: no crea intento", async () => {
    const c = await f.crearCargo(club.id, socio.id);
    await expect(
      pagarOnline(club.id, socio.id, [c.id], { ...tarjeta(), vencimiento: "01/20" }, pasarelaSimulada),
    ).rejects.toBeInstanceOf(ZodError);
    expect(await db.intentoPago.count()).toBe(0);
  });

  it("cargos de otro socio: no crea intento ni cobra", async () => {
    const otro = await f.crearSocio(club.id);
    const ajeno = await f.crearCargo(club.id, otro.id);
    await expect(pagarOnline(club.id, socio.id, [ajeno.id], tarjeta(), pasarelaSimulada)).rejects.toThrow(
      "Alguno de los cargos ya fue pagado o anulado",
    );
    expect(await db.intentoPago.count()).toBe(0);
  });
});
