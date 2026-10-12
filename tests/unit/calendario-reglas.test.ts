import { describe, expect, it } from "vitest";
import {
  armarCalendario,
  clasesEnRango,
  claveDia,
  horaFin,
  mesDeParam,
  parsearDia,
  semanasDelMes,
  type ActividadCalendario,
  type EventoCalendario,
  type ExcepcionCalendario,
} from "@/modules/calendario/reglas";
import { claveItem, detalleItem, estadoClase, etiquetaItem } from "@/modules/calendario/components/etiquetas";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const desdeSiempre = dia(2026, 1, 1);

describe("parsearDia / claveDia / mesDeParam", () => {
  it("convierte AAAA-MM-DD a medianoche UTC y vuelve", () => {
    expect(parsearDia("2026-10-14")).toEqual(dia(2026, 10, 14));
    expect(claveDia(dia(2026, 10, 14))).toBe("2026-10-14");
  });

  it("rechaza fechas inexistentes o mal formadas (no las corre de mes)", () => {
    expect(parsearDia("2026-02-31")).toBeNull();
    expect(parsearDia("2026-13-01")).toBeNull();
    expect(parsearDia("14/10/2026")).toBeNull();
    expect(parsearDia("")).toBeNull();
  });

  it("mesDeParam usa el mes pedido si es válido y si no el actual", () => {
    const hoy = new Date(Date.UTC(2026, 9, 15, 15));
    expect(mesDeParam("2026-11", hoy)).toBe("2026-11");
    expect(mesDeParam("2026-13", hoy)).toBe("2026-10");
    expect(mesDeParam(undefined, hoy)).toBe("2026-10");
    expect(mesDeParam("0050-01", hoy)).toBe("2026-10");
    expect(mesDeParam("2101-01", hoy)).toBe("2026-10");
  });
});

describe("clasesEnRango", () => {
  it("devuelve los miércoles de octubre de 2026", () => {
    expect(clasesEnRango({ diaSemana: 3, createdAt: desdeSiempre }, dia(2026, 10, 1), dia(2026, 10, 31))).toEqual([
      dia(2026, 10, 7),
      dia(2026, 10, 14),
      dia(2026, 10, 21),
      dia(2026, 10, 28),
    ]);
  });

  it("cruza de mes", () => {
    expect(clasesEnRango({ diaSemana: 1, createdAt: desdeSiempre }, dia(2026, 10, 26), dia(2026, 11, 9))).toEqual([
      dia(2026, 10, 26),
      dia(2026, 11, 2),
      dia(2026, 11, 9),
    ]);
  });

  it("no incluye clases anteriores a la creación de la actividad", () => {
    const creada = new Date(Date.UTC(2026, 9, 15, 15)); // jueves 15/10 12:00 en Argentina
    expect(clasesEnRango({ diaSemana: 3, createdAt: creada }, dia(2026, 10, 1), dia(2026, 10, 31))).toEqual([
      dia(2026, 10, 21),
      dia(2026, 10, 28),
    ]);
  });

  it("una actividad creada a las 23 h de Argentina incluye la clase de ese día", () => {
    const creada = new Date(Date.UTC(2026, 9, 15, 2)); // miércoles 14/10 23:00 en Argentina
    expect(clasesEnRango({ diaSemana: 3, createdAt: creada }, dia(2026, 10, 1), dia(2026, 10, 31))[0]).toEqual(
      dia(2026, 10, 14),
    );
  });

  it("los domingos son diaSemana 0", () => {
    expect(clasesEnRango({ diaSemana: 0, createdAt: desdeSiempre }, dia(2026, 10, 1), dia(2026, 10, 31))).toEqual([
      dia(2026, 10, 4),
      dia(2026, 10, 11),
      dia(2026, 10, 18),
      dia(2026, 10, 25),
    ]);
  });
});

describe("horaFin", () => {
  it("suma la duración, incluso pasando de medianoche", () => {
    expect(horaFin("18:00", 60)).toBe("19:00");
    expect(horaFin("09:15", 45)).toBe("10:00");
    expect(horaFin("23:30", 60)).toBe("00:30");
  });
});

describe("armarCalendario", () => {
  const natacion: ActividadCalendario = {
    id: "nat", nombre: "Natación", diaSemana: 3, hora: "19:00", duracionMin: 60, activa: true, createdAt: desdeSiempre,
  };
  const yoga: ActividadCalendario = {
    id: "yoga", nombre: "Yoga", diaSemana: 6, hora: "10:00", duracionMin: 90, activa: false, createdAt: desdeSiempre,
  };
  const semana = { desde: dia(2026, 10, 12), hasta: dia(2026, 10, 18) };
  const reprogramada: ExcepcionCalendario = {
    id: "e2", actividadId: "nat", fecha: dia(2026, 10, 14), tipo: "REPROGRAMADA",
    nuevaFecha: dia(2026, 10, 16), nuevaHora: "20:00", motivo: "Pileta en mantenimiento",
  };

  it("arma la clase normal con su hora de fin y excluye actividades inactivas", () => {
    const items = armarCalendario({ actividades: [natacion, yoga], excepciones: [], eventos: [], ...semana });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      tipo: "CLASE", fecha: dia(2026, 10, 14), hora: "19:00", horaFin: "20:00",
      titulo: "Natación", estado: "NORMAL", actividadId: "nat",
    });
  });

  it("marca la clase suspendida con su motivo", () => {
    const suspension: ExcepcionCalendario = {
      id: "e1", actividadId: "nat", fecha: dia(2026, 10, 14), tipo: "SUSPENDIDA",
      nuevaFecha: null, nuevaHora: null, motivo: "Feriado",
    };
    const [item] = armarCalendario({ actividades: [natacion], excepciones: [suspension], eventos: [], ...semana });
    expect(item).toMatchObject({ estado: "SUSPENDIDA", motivo: "Feriado", excepcionId: "e1" });
  });

  it("una reprogramada aparece como MOVIDA en la fecha original y REPROGRAMADA en la nueva", () => {
    const items = armarCalendario({ actividades: [natacion], excepciones: [reprogramada], eventos: [], ...semana });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      estado: "MOVIDA", fecha: dia(2026, 10, 14), destino: { fecha: dia(2026, 10, 16), hora: "20:00" },
    });
    expect(items[1]).toMatchObject({
      estado: "REPROGRAMADA", fecha: dia(2026, 10, 16), hora: "20:00", horaFin: "21:00",
      fechaOriginal: dia(2026, 10, 14), motivo: "Pileta en mantenimiento",
    });
  });

  it("si solo una de las dos fechas cae en el rango, muestra solo esa", () => {
    const soloNueva = armarCalendario({
      actividades: [natacion], excepciones: [reprogramada], eventos: [], desde: dia(2026, 10, 15), hasta: dia(2026, 10, 18),
    });
    expect(soloNueva.map((i) => i.estado)).toEqual(["REPROGRAMADA"]);
    const soloOriginal = armarCalendario({
      actividades: [natacion], excepciones: [reprogramada], eventos: [], desde: dia(2026, 10, 12), hasta: dia(2026, 10, 15),
    });
    expect(soloOriginal.map((i) => i.estado)).toEqual(["MOVIDA"]);
  });

  it("incluye los eventos del rango y ordena por fecha y hora", () => {
    const eventos: EventoCalendario[] = [
      { id: "ev1", titulo: "Asamblea", fecha: dia(2026, 10, 14), hora: "18:00", lugar: "Sede", descripcion: null, actividadId: null },
      { id: "ev2", titulo: "Fuera de rango", fecha: dia(2026, 10, 25), hora: "10:00", lugar: null, descripcion: null, actividadId: null },
    ];
    const items = armarCalendario({ actividades: [natacion], excepciones: [], eventos, ...semana });
    expect(items.map((i) => [i.tipo, i.titulo, i.hora])).toEqual([
      ["EVENTO", "Asamblea", "18:00"],
      ["CLASE", "Natación", "19:00"],
    ]);
    expect(items[0]).toMatchObject({ estado: "NORMAL", eventoId: "ev1", lugar: "Sede" });
  });
});

describe("semanasDelMes", () => {
  const resumen = (periodo: string) => {
    const semanas = semanasDelMes(periodo);
    return {
      semanas: semanas.length,
      primero: claveDia(semanas[0][0]),
      ultimo: claveDia(semanas.at(-1)![6]),
      todasDeLunesADomingo: semanas.every((s) => s.length === 7 && s[0].getUTCDay() === 1 && s[6].getUTCDay() === 0),
    };
  };

  it("octubre 2026 empieza en jueves: la grilla arranca el lunes 28/9 y tiene 5 semanas", () => {
    expect(resumen("2026-10")).toEqual({ semanas: 5, primero: "2026-09-28", ultimo: "2026-11-01", todasDeLunesADomingo: true });
  });

  it("noviembre 2026 ocupa 6 semanas", () => {
    expect(resumen("2026-11")).toEqual({ semanas: 6, primero: "2026-10-26", ultimo: "2026-12-06", todasDeLunesADomingo: true });
  });

  it("febrero 2027 ocupa exactamente 4 semanas", () => {
    expect(resumen("2027-02")).toEqual({ semanas: 4, primero: "2027-02-01", ultimo: "2027-02-28", todasDeLunesADomingo: true });
  });
});

describe("etiquetas", () => {
  const base = { tipo: "CLASE" as const, fecha: dia(2026, 10, 14), hora: "19:00", horaFin: "20:00", titulo: "Natación" };

  it("texto corto para la grilla", () => {
    expect(etiquetaItem({ ...base, estado: "NORMAL" })).toBe("19:00 Natación");
    expect(etiquetaItem({ ...base, estado: "SUSPENDIDA", motivo: "Feriado" })).toBe("19:00 Natación (suspendida)");
    expect(
      etiquetaItem({ ...base, estado: "MOVIDA", motivo: "Lluvia", destino: { fecha: dia(2026, 10, 16), hora: "20:00" } }),
    ).toBe("19:00 Natación → Vie 16/10 20:00");
    expect(
      etiquetaItem({ ...base, fecha: dia(2026, 10, 16), hora: "20:00", horaFin: "21:00", estado: "REPROGRAMADA", fechaOriginal: dia(2026, 10, 14) }),
    ).toBe("20:00 Natación (reprogramada)");
  });

  it("texto completo para la agenda", () => {
    expect(detalleItem({ ...base, estado: "NORMAL" })).toBe("19:00–20:00 Natación");
    expect(detalleItem({ ...base, estado: "SUSPENDIDA", motivo: "Feriado" })).toBe("19:00–20:00 Natación · Suspendida: Feriado");
    expect(
      detalleItem({ ...base, estado: "MOVIDA", motivo: "Lluvia", destino: { fecha: dia(2026, 10, 16), hora: "20:00" } }),
    ).toBe("19:00–20:00 Natación · Reprogramada al Vie 16/10 20:00: Lluvia");
    expect(
      detalleItem({
        ...base, fecha: dia(2026, 10, 16), hora: "20:00", horaFin: "21:00",
        estado: "REPROGRAMADA", motivo: "Lluvia", fechaOriginal: dia(2026, 10, 14),
      }),
    ).toBe("20:00–21:00 Natación · Reprogramada desde Mié 14/10: Lluvia");
    expect(
      detalleItem({ tipo: "EVENTO", fecha: dia(2026, 10, 14), hora: "18:00", titulo: "Asamblea", estado: "NORMAL", lugar: "Sede" }),
    ).toBe("18:00 Asamblea · Sede");
  });
});

describe("claveItem / estadoClase", () => {
  it("dos clases de la misma actividad reprogramadas al mismo día y hora tienen claves distintas", () => {
    const comun = { tipo: "CLASE" as const, fecha: dia(2026, 10, 16), hora: "20:00", titulo: "Natación", estado: "REPROGRAMADA" as const, actividadId: "nat" };
    const a = claveItem({ ...comun, excepcionId: "e1", fechaOriginal: dia(2026, 10, 7) });
    const b = claveItem({ ...comun, excepcionId: "e2", fechaOriginal: dia(2026, 10, 14) });
    expect(a).not.toBe(b);
  });

  it("describe el estado de la clase seleccionada, incluido el normal", () => {
    expect(estadoClase(null)).toBe("Estado: normal");
    expect(estadoClase({ tipo: "SUSPENDIDA", motivo: "Feriado", nuevaFecha: null, nuevaHora: null })).toBe("Suspendida: Feriado");
    expect(
      estadoClase({ tipo: "REPROGRAMADA", motivo: "Lluvia", nuevaFecha: dia(2026, 10, 16), nuevaHora: "20:00" }),
    ).toBe("Reprogramada al Vie 16/10 20:00: Lluvia");
  });
});
