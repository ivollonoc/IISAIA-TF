import { describe, expect, it } from "vitest";
import { DIA_MS, inicioDelDia, periodoActual, periodoAnterior, periodoSiguiente, PERIODO_REGEX } from "@/lib/periodo";

describe("periodoActual", () => {
  it("formatea YYYY-MM con mes de dos dígitos", () => {
    expect(periodoActual(new Date(2026, 0, 15))).toBe("2026-01");
    expect(periodoActual(new Date(2026, 11, 31))).toBe("2026-12");
  });

  it("siempre cumple el regex de período", () => {
    expect(PERIODO_REGEX.test(periodoActual())).toBe(true);
  });
});

describe("helpers de días compartidos", () => {
  it("inicioDelDia es la medianoche UTC del día calendario de Argentina", () => {
    // 14/10/2026 23:00 en Argentina = 15/10/2026 02:00 UTC
    expect(inicioDelDia(new Date(Date.UTC(2026, 9, 15, 2)))).toEqual(new Date(Date.UTC(2026, 9, 14)));
  });

  it("periodoSiguiente y periodoAnterior cruzan el año", () => {
    expect(periodoSiguiente("2026-12")).toBe("2027-01");
    expect(periodoAnterior("2027-01")).toBe("2026-12");
  });

  it("DIA_MS es un día en milisegundos", () => {
    expect(DIA_MS).toBe(24 * 60 * 60 * 1000);
  });
});
