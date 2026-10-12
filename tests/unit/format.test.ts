import { describe, expect, it } from "vitest";
import { formatDia } from "@/lib/format";

describe("formatDia", () => {
  it("muestra el día calendario de un vencimiento (medianoche UTC) sin correrlo por zona horaria", () => {
    expect(formatDia(new Date(Date.UTC(2026, 9, 10)))).toBe("10/10/2026");
  });
});
