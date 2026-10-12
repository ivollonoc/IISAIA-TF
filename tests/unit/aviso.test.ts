import { describe, expect, it } from "vitest";
import { leerAviso, queryAviso } from "@/lib/aviso";

const params = (query: string) => Object.fromEntries(new URLSearchParams(query));

describe("avisos firmados en la URL", () => {
  it("muestra un mensaje generado por la app", () => {
    expect(leerAviso(params(queryAviso("ok", "Pago aprobado")))).toEqual({ ok: "Pago aprobado" });
    expect(leerAviso(params(queryAviso("error", "No hay cupo")))).toEqual({ error: "No hay cupo" });
  });

  it("ignora un mensaje armado a mano, sin firma o con el texto alterado", () => {
    expect(leerAviso({ ok: "Ganaste un premio" })).toEqual({});
    const firmado = params(queryAviso("ok", "Pago aprobado"));
    expect(leerAviso({ ...firmado, ok: "Pago aprobado, llamá al 0800" })).toEqual({});
  });

  it("la firma de un ok no sirve para un error con el mismo texto", () => {
    const { f } = params(queryAviso("ok", "Hola"));
    expect(leerAviso({ error: "Hola", f })).toEqual({});
  });

  it("sin mensaje no muestra nada", () => {
    expect(leerAviso({})).toEqual({});
  });
});
