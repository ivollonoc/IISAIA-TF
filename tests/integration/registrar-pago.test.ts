import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Club, Socio } from "@prisma/client";
import { db } from "@/lib/db";
import { mensajeDeError } from "@/lib/errors";
import { registrarPago } from "@/modules/cuenta-corriente/pagos.service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

let club: Club;
let socio: Socio;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
  socio = await f.crearSocio(club.id);
});

describe("registrarPago", () => {
  it("paga varios cargos: el monto es la suma y quedan PAGADOS y vinculados", async () => {
    const c1 = await f.crearCargo(club.id, socio.id, { monto: 15000 });
    const c2 = await f.crearCargo(club.id, socio.id, { monto: 5000 });
    const pago = await registrarPago(club.id, {
      socioId: socio.id,
      cargoIds: [c1.id, c2.id],
      medio: "EFECTIVO",
      registradoPor: "admin-1",
    });
    expect(pago).toMatchObject({ monto: 20000, medio: "EFECTIVO", registradoPor: "admin-1", socioId: socio.id });
    const cargos = await db.cargo.findMany({ where: { id: { in: [c1.id, c2.id] } } });
    expect(cargos.every((c) => c.estado === "PAGADO" && c.pagoId === pago.id)).toBe(true);
  });

  it("cuenta una sola vez los ids repetidos", async () => {
    const c = await f.crearCargo(club.id, socio.id, { monto: 15000 });
    const pago = await registrarPago(club.id, { socioId: socio.id, cargoIds: [c.id, c.id], medio: "OTRO" });
    expect(pago.monto).toBe(15000);
  });

  it("rechaza si algún cargo ya está pagado, sin cambios parciales", async () => {
    const pagado = await f.crearCargo(club.id, socio.id, { estado: "PAGADO" });
    const pendiente = await f.crearCargo(club.id, socio.id);
    await expect(
      registrarPago(club.id, { socioId: socio.id, cargoIds: [pagado.id, pendiente.id], medio: "EFECTIVO" }),
    ).rejects.toThrow("Alguno de los cargos ya fue pagado o anulado");
    expect(await db.pago.count()).toBe(0);
    expect((await db.cargo.findUnique({ where: { id: pendiente.id } }))?.estado).toBe("PENDIENTE");
  });

  it("rechaza un cargo anulado", async () => {
    const anulado = await f.crearCargo(club.id, socio.id, { estado: "ANULADO" });
    await expect(
      registrarPago(club.id, { socioId: socio.id, cargoIds: [anulado.id], medio: "EFECTIVO" }),
    ).rejects.toThrow("Alguno de los cargos ya fue pagado o anulado");
  });

  it("rechaza un cargo de otro socio o de otro club", async () => {
    const otroSocio = await f.crearSocio(club.id);
    const ajeno = await f.crearCargo(club.id, otroSocio.id);
    await expect(
      registrarPago(club.id, { socioId: socio.id, cargoIds: [ajeno.id], medio: "EFECTIVO" }),
    ).rejects.toThrow("Cargo no encontrado");

    const otroClub = await f.crearClub();
    const propio = await f.crearCargo(club.id, socio.id);
    await expect(
      registrarPago(otroClub.id, { socioId: socio.id, cargoIds: [propio.id], medio: "EFECTIVO" }),
    ).rejects.toThrow("Cargo no encontrado");
    expect(await db.pago.count()).toBe(0);
  });

  it("rechaza una lista vacía", async () => {
    await expect(registrarPago(club.id, { socioId: socio.id, cargoIds: [], medio: "EFECTIVO" })).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it("dentro de una transacción externa, se deshace si la transacción falla", async () => {
    const c = await f.crearCargo(club.id, socio.id);
    await expect(
      db.$transaction(async (tx) => {
        await registrarPago(club.id, { socioId: socio.id, cargoIds: [c.id], medio: "ONLINE" }, tx);
        throw new Error("falla después");
      }),
    ).rejects.toThrow("falla después");
    expect(await db.pago.count()).toBe(0);
    expect((await db.cargo.findUnique({ where: { id: c.id } }))?.estado).toBe("PENDIENTE");
  });

  it("dos pagos simultáneos del mismo cargo: exactamente uno se registra", async () => {
    const c = await f.crearCargo(club.id, socio.id);
    const resultados = await Promise.allSettled([
      registrarPago(club.id, { socioId: socio.id, cargoIds: [c.id], medio: "ONLINE" }),
      registrarPago(club.id, { socioId: socio.id, cargoIds: [c.id], medio: "EFECTIVO" }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of resultados) if (r.status === "rejected") expect(mensajeDeError(r.reason)).not.toBeNull();
    expect(await db.pago.count()).toBe(1);
  });
});
