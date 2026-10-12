import { describe, expect, it } from "vitest";
import { hrefAgenda, queryVista, rutaActividadesSocio, rutaAgenda, vistaDeParams } from "@/modules/calendario/vista";

const hoy = new Date(Date.UTC(2026, 9, 15, 15)); // jueves 15/10/2026

describe("vistaDeParams", () => {
  it("por defecto muestra la semana actual (desde el lunes) y el mes actual", () => {
    expect(vistaDeParams({}, hoy)).toEqual({ vista: "semana", semana: "2026-10-12", mes: "2026-10" });
  });

  it("toma vista, semana y mes de la URL y normaliza la semana a su lunes", () => {
    expect(vistaDeParams({ vista: "mes", semana: "2026-10-22", mes: "2026-11" }, hoy)).toEqual({
      vista: "mes", semana: "2026-10-19", mes: "2026-11",
    });
  });

  it("sin mes en la URL usa el mes de la semana elegida; valores inválidos vuelven al default", () => {
    expect(vistaDeParams({ semana: "2026-11-30" }, hoy).mes).toBe("2026-11");
    expect(vistaDeParams({ vista: "otra", semana: "x", mes: "2026-13" }, hoy)).toEqual({
      vista: "semana", semana: "2026-10-12", mes: "2026-10",
    });
  });
});

describe("hrefAgenda / queryVista", () => {
  const v = { vista: "lista" as const, semana: "2026-10-12", mes: "2026-10" };

  it("arma la URL conservando la vista y sumando la selección", () => {
    expect(hrefAgenda("/c/demo/admin/agenda", v)).toBe("/c/demo/admin/agenda?vista=lista&semana=2026-10-12&mes=2026-10");
    expect(hrefAgenda("/c/demo/admin/agenda", v, { evento: "e1" })).toBe(
      "/c/demo/admin/agenda?vista=lista&semana=2026-10-12&mes=2026-10&evento=e1",
    );
  });

  it("rutaAgenda vuelve a la vista saneada con la selección", () => {
    expect(rutaAgenda("demo", "vista=mes&mes=2026-10&evento=x")).toBe("/c/demo/admin/agenda?vista=mes&mes=2026-10");
    expect(rutaAgenda("demo", "", { clase: "a1:2026-10-21" })).toBe("/c/demo/admin/agenda?clase=a1%3A2026-10-21");
  });

  it("rutaActividadesSocio es la pestaña Actividades y eventos del socio", () => {
    expect(rutaActividadesSocio("demo")).toBe("/c/demo/socio/actividades");
  });

  it("queryVista solo deja pasar vista, semana y mes válidos (el resto se descarta)", () => {
    expect(queryVista("vista=mes&semana=2026-10-12&mes=2026-10&ok=hola&evento=x")).toBe("?vista=mes&semana=2026-10-12&mes=2026-10");
    expect(queryVista("vista=<script>&mes=2026-10")).toBe("?mes=2026-10");
    expect(queryVista("")).toBe("");
  });
});
