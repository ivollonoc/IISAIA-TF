import { describe, expect, it } from "vitest";
import { estaAlDia, periodoActual, PERIODO_REGEX } from "@/lib/periodo";

describe("periodoActual", () => {
  it("formatea YYYY-MM con mes de dos dígitos", () => {
    expect(periodoActual(new Date(2026, 0, 15))).toBe("2026-01");
    expect(periodoActual(new Date(2026, 11, 31))).toBe("2026-12");
  });

  it("siempre cumple el regex de período", () => {
    expect(PERIODO_REGEX.test(periodoActual())).toBe(true);
  });
});

describe("estaAlDia", () => {
  it("es true si pagó el período indicado", () => {
    expect(estaAlDia(["2026-08", "2026-09"], "2026-09")).toBe(true);
  });

  it("es false si solo pagó meses anteriores", () => {
    expect(estaAlDia(["2026-08"], "2026-09")).toBe(false);
  });

  it("es false sin pagos", () => {
    expect(estaAlDia([], "2026-09")).toBe(false);
  });
});
