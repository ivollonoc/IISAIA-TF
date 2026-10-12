import { describe, expect, it } from "vitest";
import { getPasarela } from "@/modules/pagos-online";
import { tarjetaSchema, tarjetaVigente } from "@/modules/pagos-online/schema";
import { pasarelaSimulada } from "@/modules/pagos-online/simulada";

const tarjeta = { numero: "4000000000000001", vencimiento: "12/30", cvv: "123", titular: "Lucía Gómez" };
const cobro = { intentoId: "int1", monto: 15000, descripcion: "Cuota social 2026-10" };

describe("pasarela simulada", () => {
  it("aprueba la tarjeta terminada en 0001", async () => {
    expect(await pasarelaSimulada.cobrar(cobro, tarjeta)).toEqual({ estado: "APROBADO", referencia: "SIM-int1" });
  });

  it("rechaza la tarjeta terminada en 0002 por fondos insuficientes", async () => {
    expect(await pasarelaSimulada.cobrar(cobro, { ...tarjeta, numero: "4000000000000002" })).toEqual({
      estado: "RECHAZADO",
      motivo: "Fondos insuficientes",
    });
  });

  it("aprueba cualquier otra tarjeta", async () => {
    const r = await pasarelaSimulada.cobrar(cobro, { ...tarjeta, numero: "5555444433331111" });
    expect(r.estado).toBe("APROBADO");
  });
});

describe("getPasarela", () => {
  it("devuelve la simulada por defecto y por nombre", () => {
    expect(getPasarela("simulada").nombre).toBe("simulada");
  });

  it("Mercado Pago está preparada pero no implementada", async () => {
    const mp = getPasarela("mercadopago");
    expect(mp.nombre).toBe("mercadopago");
    await expect(mp.cobrar(cobro, tarjeta)).rejects.toThrow("Pasarela Mercado Pago no implementada");
  });

  it("rechaza una pasarela desconocida", () => {
    expect(() => getPasarela("paypal")).toThrow("Pasarela desconocida: paypal");
  });
});

describe("tarjetaSchema", () => {
  it("normaliza el número quitando espacios y guiones", () => {
    const r = tarjetaSchema.parse({ ...tarjeta, numero: "4000 0000-0000 0001" });
    expect(r.numero).toBe("4000000000000001");
  });

  it("rechaza números que no tienen 16 dígitos", () => {
    expect(tarjetaSchema.safeParse({ ...tarjeta, numero: "400000000000001" }).success).toBe(false);
  });

  it("rechaza vencimientos mal formados o pasados", () => {
    expect(tarjetaSchema.safeParse({ ...tarjeta, vencimiento: "13/30" }).success).toBe(false);
    expect(tarjetaSchema.safeParse({ ...tarjeta, vencimiento: "01/20" }).success).toBe(false);
  });

  it("rechaza CVV de menos de 3 dígitos", () => {
    expect(tarjetaSchema.safeParse({ ...tarjeta, cvv: "12" }).success).toBe(false);
  });

  it("tarjetaVigente vale hasta el último día del mes de vencimiento", () => {
    expect(tarjetaVigente("10/26", new Date(2026, 9, 31, 23))).toBe(true);
    expect(tarjetaVigente("09/26", new Date(2026, 9, 1))).toBe(false);
  });
});
