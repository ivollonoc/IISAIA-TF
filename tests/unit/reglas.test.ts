import { describe, expect, it } from "vitest";
import {
  estaAlDia,
  estaVencido,
  inicioDelDia,
  periodoSiguiente,
  periodosGenerables,
  rangoDelMes,
  saldoAcumulado,
  vencimiento,
  type Movimiento,
} from "@/modules/cuenta-corriente/reglas";

const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const hoy = new Date(2026, 9, 15, 13, 0); // 15/10/2026 13:00, hora local

describe("vencimiento", () => {
  it("es el día indicado del mes del período, a medianoche UTC", () => {
    expect(vencimiento("2026-10", 10)).toEqual(utc(2026, 10, 10));
  });

  it("el día 28 existe en febrero", () => {
    expect(vencimiento("2027-02", 28)).toEqual(utc(2027, 2, 28));
  });

  it("diciembre queda en el mismo año", () => {
    expect(vencimiento("2026-12", 5)).toEqual(utc(2026, 12, 5));
  });

  it("rechaza días fuera de 1..28 y períodos inválidos", () => {
    expect(() => vencimiento("2026-10", 29)).toThrow();
    expect(() => vencimiento("2026-10", 0)).toThrow();
    expect(() => vencimiento("2026-13", 10)).toThrow();
  });
});

describe("períodos", () => {
  it("periodoSiguiente cruza el año", () => {
    expect(periodoSiguiente("2026-12")).toBe("2027-01");
    expect(periodoSiguiente("2026-09")).toBe("2026-10");
  });

  it("periodosGenerables devuelve el actual y el siguiente", () => {
    expect(periodosGenerables(new Date(2026, 11, 20))).toEqual(["2026-12", "2027-01"]);
  });

  it("rangoDelMes va del día 1 (inclusive) al 1 del mes siguiente (exclusive), en hora local", () => {
    expect(rangoDelMes("2026-12")).toEqual({ desde: new Date(2026, 11, 1), hasta: new Date(2027, 0, 1) });
  });
});

describe("estaVencido / estaAlDia", () => {
  const pendiente = (venc: Date) => ({ estado: "PENDIENTE" as const, vencimiento: venc });

  it("inicioDelDia toma el día calendario local", () => {
    expect(inicioDelDia(hoy)).toEqual(utc(2026, 10, 15));
  });

  it("sin cargos está al día", () => {
    expect(estaAlDia([], hoy)).toBe(true);
  });

  it("un pendiente que vence más adelante no lo hace moroso", () => {
    expect(estaAlDia([pendiente(utc(2026, 10, 20))], hoy)).toBe(true);
  });

  it("un pendiente que vence hoy todavía no está vencido", () => {
    expect(estaVencido(pendiente(utc(2026, 10, 15)), hoy)).toBe(false);
    expect(estaAlDia([pendiente(utc(2026, 10, 15))], hoy)).toBe(true);
  });

  it("un pendiente vencido lo hace moroso", () => {
    expect(estaAlDia([pendiente(utc(2026, 10, 14))], hoy)).toBe(false);
  });

  it("pagados y anulados no cuentan aunque estén vencidos", () => {
    expect(
      estaAlDia(
        [
          { estado: "PAGADO", vencimiento: utc(2026, 9, 10) },
          { estado: "ANULADO", vencimiento: utc(2026, 9, 10) },
        ],
        hoy,
      ),
    ).toBe(true);
  });
});

describe("saldoAcumulado", () => {
  it("ordena por fecha (el cargo antes que el pago el mismo día) y no suma anulados", () => {
    const m = (id: string, fecha: Date, tipo: "CARGO" | "PAGO", monto: number, anulado = false): Movimiento => ({
      id,
      fecha,
      tipo,
      concepto: id,
      monto,
      anulado,
    });
    const r = saldoAcumulado([
      m("p", new Date(2026, 9, 3), "PAGO", 60),
      m("c30", new Date(2026, 9, 3), "CARGO", 30),
      m("anul", new Date(2026, 9, 2), "CARGO", 50, true),
      m("c100", new Date(2026, 9, 1), "CARGO", 100),
    ]);
    expect(r.map((x) => [x.id, x.saldo])).toEqual([
      ["c100", 100],
      ["anul", 100],
      ["c30", 130],
      ["p", 70],
    ]);
  });
});
