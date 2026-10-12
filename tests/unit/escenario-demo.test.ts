import { describe, expect, it } from "vitest";
import { escenarioDemo } from "../../prisma/escenario-demo";
import { inicioDelDia, periodoAnterior, vencimiento } from "@/modules/cuenta-corriente/reglas";

// Mediodía en Argentina (15:00 UTC) del día indicado.
const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d, 15));

describe("periodoAnterior", () => {
  it("cruza el año", () => {
    expect(periodoAnterior("2027-01")).toBe("2026-12");
    expect(periodoAnterior("2026-10")).toBe("2026-09");
  });
});

describe("escenarioDemo", () => {
  it("a principio de mes usa el mes anterior (vencido) y el actual (por vencer)", () => {
    expect(escenarioDemo(dia(2026, 10, 5))).toEqual({ vencido: "2026-09", porVencer: "2026-10", diaVencimiento: 12 });
  });

  it("a fin de mes usa el actual (vencido) y el siguiente (por vencer)", () => {
    expect(escenarioDemo(dia(2026, 10, 30))).toEqual({ vencido: "2026-10", porVencer: "2026-11", diaVencimiento: 10 });
  });

  it("cualquier día del año deja un período vencido y otro por vencer", () => {
    for (let d = 0; d < 366; d++) {
      const hoy = new Date(dia(2026, 1, 1).getTime() + d * 86_400_000);
      const e = escenarioDemo(hoy);
      expect(vencimiento(e.vencido, e.diaVencimiento).getTime()).toBeLessThan(inicioDelDia(hoy).getTime());
      expect(vencimiento(e.porVencer, e.diaVencimiento).getTime()).toBeGreaterThan(inicioDelDia(hoy).getTime());
    }
  });
});
