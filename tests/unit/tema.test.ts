import { describe, expect, it } from "vitest";
import { contraste, parseTema, temaCssVars, PASOS } from "@/lib/tema";

const escala = Object.fromEntries(
  PASOS.map((p, i) => [p, ["#fef2f2", "#fee2e2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d", "#450a0a"][i]]),
);
const valido = { primario: "#C8102E", sobrePrimario: "#ffffff", escala };

describe("contraste", () => {
  it("negro sobre blanco es 21 y es simétrico", () => {
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contraste("#ffffff", "#000000")).toBeCloseTo(21);
  });
});

describe("parseTema", () => {
  it("acepta un tema legible y normaliza a minúsculas", () => {
    expect(parseTema(valido)?.primario).toBe("#c8102e");
  });

  it("rechaza texto ilegible sobre el primario", () => {
    expect(parseTema({ ...valido, primario: "#ffd700", sobrePrimario: "#ffffff" })).toBeNull();
  });

  it("rechaza un 700 que no se lee sobre blanco", () => {
    expect(parseTema({ ...valido, escala: { ...escala, "700": "#fca5a5" } })).toBeNull();
  });

  it("rechaza basura (club sin tema)", () => {
    expect(parseTema(null)).toBeNull();
    expect(parseTema({ primario: "rojo" })).toBeNull();
  });
});

describe("temaCssVars", () => {
  it("genera las variables y usa el primario como secundario por defecto", () => {
    const vars = temaCssVars(parseTema(valido)!);
    expect(vars["--club-primario"]).toBe("#c8102e");
    expect(vars["--club-secundario"]).toBe("#c8102e");
    expect(vars["--club-950"]).toBe("#450a0a");
  });
});
