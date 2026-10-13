import { describe, expect, it } from "vitest";
import { formatDia, formatDiaCorto, formatFechaHora, nombreMes } from "@/lib/format";

describe("formatDia", () => {
  it("muestra el día calendario de un vencimiento (medianoche UTC) sin correrlo por zona horaria", () => {
    expect(formatDia(new Date(Date.UTC(2026, 9, 10)))).toBe("10/10/2026");
  });
});

describe("formatFechaHora", () => {
  it("muestra fecha y hora de Argentina (UTC-3) de un instante", () => {
    expect(formatFechaHora(new Date(Date.UTC(2026, 9, 12, 23, 15)))).toBe("12/10/2026 20:15");
    expect(formatFechaHora(new Date(Date.UTC(2026, 9, 13, 2, 5)))).toBe("12/10/2026 23:05");
  });
});

describe("formatDiaCorto y nombreMes", () => {
  it("muestra día de la semana y fecha de un día guardado a medianoche UTC", () => {
    expect(formatDiaCorto(new Date(Date.UTC(2026, 9, 14)))).toBe("Mié 14/10");
    expect(formatDiaCorto(new Date(Date.UTC(2026, 10, 1)))).toBe("Dom 01/11");
  });

  it("nombra el mes de un período", () => {
    expect(nombreMes("2026-10")).toBe("octubre 2026");
    expect(nombreMes("2027-01")).toBe("enero 2027");
  });
});
