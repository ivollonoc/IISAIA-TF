import { describe, expect, it } from "vitest";
import { medioVentanillaSchema } from "@/modules/cuenta-corriente/schema";
import { parsearCargos } from "@/modules/pagos-online/schema";

describe("medioVentanillaSchema", () => {
  it("acepta los medios de ventanilla", () => {
    for (const m of ["EFECTIVO", "TRANSFERENCIA", "OTRO"]) expect(medioVentanillaSchema.parse(m)).toBe(m);
  });

  it("rechaza ONLINE (solo lo registra el checkout) y valores vacíos", () => {
    expect(medioVentanillaSchema.safeParse("ONLINE").success).toBe(false);
    expect(medioVentanillaSchema.safeParse(null).success).toBe(false);
  });
});

describe("parsearCargos (parámetro ?cargos del checkout)", () => {
  it("acepta parámetros repetidos y separados por coma, sin vacíos", () => {
    expect(parsearCargos(["a", "b,c"])).toEqual(["a", "b", "c"]);
    expect(parsearCargos("a,,b")).toEqual(["a", "b"]);
    expect(parsearCargos(undefined)).toEqual([]);
  });
});
