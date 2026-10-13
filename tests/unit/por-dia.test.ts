import { describe, expect, it } from "vitest";
import { agruparPorDia } from "@/modules/calendario/por-dia";
import { ordenActividades } from "@/modules/calendario/vista";
import { formatDiaLargo } from "@/lib/format";

const dia = (d: number) => new Date(Date.UTC(2026, 9, d));

describe("agruparPorDia", () => {
  it("mezcla clases y eventos por día y hora; ante la misma hora, primero la clase", () => {
    const clases = [
      { id: "yoga-15", fecha: dia(15), hora: "18:00" },
      { id: "futbol-14", fecha: dia(14), hora: "19:00" },
      { id: "yoga-14", fecha: dia(14), hora: "09:00" },
    ];
    const eventos = [
      { id: "cena-14", fecha: dia(14), hora: "19:00" },
      { id: "torneo-20", fecha: dia(20), hora: "10:00" },
    ];

    const dias = agruparPorDia(clases, eventos);
    expect(dias.map((d) => [d.fecha.toISOString().slice(0, 10), d.items.map((i) => `${i.tipo}:${i.item.id}`)])).toEqual([
      ["2026-10-14", ["clase:yoga-14", "clase:futbol-14", "evento:cena-14"]],
      ["2026-10-15", ["clase:yoga-15"]],
      ["2026-10-20", ["evento:torneo-20"]],
    ]);
  });

  it("sin clases ni eventos no hay días", () => {
    expect(agruparPorDia([], [])).toEqual([]);
  });
});

describe("formatDiaLargo", () => {
  it("muestra el día de la semana, el número y el mes", () => {
    expect(formatDiaLargo(dia(14))).toBe("Miércoles 14 de octubre");
    expect(formatDiaLargo(new Date(Date.UTC(2026, 10, 1)))).toBe("Domingo 1 de noviembre");
  });
});

describe("ordenActividades", () => {
  it("por fecha solo si se pidió; cualquier otro valor ordena por tipo", () => {
    expect(ordenActividades("fecha")).toBe("fecha");
    expect(ordenActividades("tipo")).toBe("tipo");
    expect(ordenActividades(undefined)).toBe("tipo");
    expect(ordenActividades("<script>")).toBe("tipo");
  });
});
