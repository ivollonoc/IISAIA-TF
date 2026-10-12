import { describe, expect, it } from "vitest";
import {
  armarCalendario,
  bloquesSemana,
  clasesEnRango,
  claveDia,
  horaFin,
  horarioDe,
  lunesDeParam,
  mesDeParam,
  parsearDia,
  semanaDe,
  semanasDelMes,
  type ActividadCalendario,
  type EventoCalendario,
  type ExcepcionCalendario,
  type HorarioCalendario,
} from "@/modules/calendario/reglas";
import {
  claveItem,
  detalleItem,
  estadoClase,
  etiquetaItem,
  formatHorarios,
} from "@/modules/calendario/components/etiquetas";

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

describe("clasesEnRango / horarioDe", () => {
  const miercoles: HorarioCalendario = { diaSemana: 3, hora: "19:00", duracionMin: 60 };
  const lunes: HorarioCalendario = { diaSemana: 1, hora: "18:00", duracionMin: 90 };
  const vigente = (horarios: HorarioCalendario[], fechaInicio = desdeSiempre, fechaFin: Date | null = null) => ({
    horarios, fechaInicio, fechaFin,
  });
  const fechas = (r: { fecha: Date }[]) => r.map((c) => claveDia(c.fecha));

  it("devuelve los miércoles de octubre de 2026 con su horario", () => {
    const clases = clasesEnRango(vigente([miercoles]), dia(2026, 10, 1), dia(2026, 10, 31));
    expect(fechas(clases)).toEqual(["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"]);
    expect(clases[0].horario).toEqual(miercoles);
  });

  it("con lunes y miércoles devuelve las 8 clases de octubre ordenadas, cada una con su horario", () => {
    const clases = clasesEnRango(vigente([miercoles, lunes]), dia(2026, 10, 1), dia(2026, 10, 31));
    expect(fechas(clases)).toEqual([
      "2026-10-05", "2026-10-07", "2026-10-12", "2026-10-14", "2026-10-19", "2026-10-21", "2026-10-26", "2026-10-28",
    ]);
    expect(clases[0].horario.hora).toBe("18:00");
    expect(clases[1].horario.hora).toBe("19:00");
  });

  it("cruza de mes", () => {
    expect(fechas(clasesEnRango(vigente([lunes]), dia(2026, 10, 26), dia(2026, 11, 9)))).toEqual([
      "2026-10-26", "2026-11-02", "2026-11-09",
    ]);
  });

  it("respeta inicio y fin, ambos inclusive", () => {
    const clases = clasesEnRango(vigente([miercoles], dia(2026, 10, 14), dia(2026, 10, 21)), dia(2026, 10, 1), dia(2026, 10, 31));
    expect(fechas(clases)).toEqual(["2026-10-14", "2026-10-21"]);
  });

  it("los domingos son diaSemana 0", () => {
    const domingo = { diaSemana: 0, hora: "10:00", duracionMin: 60 };
    expect(fechas(clasesEnRango(vigente([domingo]), dia(2026, 10, 1), dia(2026, 10, 31)))).toEqual([
      "2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25",
    ]);
  });

  it("horarioDe devuelve el horario del día o null si no hay clase o está fuera de vigencia", () => {
    const act = vigente([miercoles, lunes], dia(2026, 10, 1), dia(2026, 10, 31));
    expect(horarioDe(act, dia(2026, 10, 12))).toEqual(lunes);
    expect(horarioDe(act, dia(2026, 10, 13))).toBeNull();
    expect(horarioDe(act, dia(2026, 11, 2))).toBeNull();
    expect(horarioDe(act, dia(2026, 9, 28))).toBeNull();
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
    id: "nat", nombre: "Natación", activa: true, fechaInicio: desdeSiempre, fechaFin: null,
    horarios: [{ diaSemana: 3, hora: "19:00", duracionMin: 60 }, { diaSemana: 5, hora: "08:00", duracionMin: 45 }],
  };
  const yoga: ActividadCalendario = {
    id: "yoga", nombre: "Yoga", activa: false, fechaInicio: desdeSiempre, fechaFin: null,
    horarios: [{ diaSemana: 6, hora: "10:00", duracionMin: 90 }],
  };
  const semana = { desde: dia(2026, 10, 12), hasta: dia(2026, 10, 18) };
  const reprogramada: ExcepcionCalendario = {
    id: "e2", actividadId: "nat", fecha: dia(2026, 10, 14), tipo: "REPROGRAMADA",
    nuevaFecha: dia(2026, 10, 16), nuevaHora: "20:00", motivo: "Pileta en mantenimiento",
  };

  it("arma cada clase con la hora de fin de su horario y excluye actividades inactivas", () => {
    const items = armarCalendario({ actividades: [natacion, yoga], excepciones: [], eventos: [], ...semana });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      tipo: "CLASE", fecha: dia(2026, 10, 14), hora: "19:00", horaFin: "20:00",
      titulo: "Natación", estado: "NORMAL", actividadId: "nat",
    });
    expect(items[1]).toMatchObject({ fecha: dia(2026, 10, 16), hora: "08:00", horaFin: "08:45" });
  });

  it("marca la clase suspendida con su motivo", () => {
    const suspension: ExcepcionCalendario = {
      id: "e1", actividadId: "nat", fecha: dia(2026, 10, 14), tipo: "SUSPENDIDA",
      nuevaFecha: null, nuevaHora: null, motivo: "Feriado",
    };
    const [item] = armarCalendario({ actividades: [natacion], excepciones: [suspension], eventos: [], ...semana });
    expect(item).toMatchObject({ estado: "SUSPENDIDA", motivo: "Feriado", excepcionId: "e1" });
  });

  it("una reprogramada aparece como MOVIDA en la fecha original y REPROGRAMADA en la nueva, con la duración original", () => {
    const items = armarCalendario({ actividades: [natacion], excepciones: [reprogramada], eventos: [], ...semana })
      .filter((i) => i.excepcionId);
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
      actividades: [natacion], excepciones: [reprogramada], eventos: [], desde: dia(2026, 10, 15), hasta: dia(2026, 10, 15),
    });
    expect(soloNueva.map((i) => i.estado)).toEqual([]);
    const conNueva = armarCalendario({
      actividades: [natacion], excepciones: [reprogramada], eventos: [], desde: dia(2026, 10, 15), hasta: dia(2026, 10, 16),
    });
    expect(conNueva.filter((i) => i.excepcionId).map((i) => i.estado)).toEqual(["REPROGRAMADA"]);
    const soloOriginal = armarCalendario({
      actividades: [natacion], excepciones: [reprogramada], eventos: [], desde: dia(2026, 10, 12), hasta: dia(2026, 10, 15),
    });
    expect(soloOriginal.map((i) => i.estado)).toEqual(["MOVIDA"]);
  });

  it("no arma clases después del fin de la actividad", () => {
    const terminada = { ...natacion, fechaFin: dia(2026, 10, 13) };
    expect(armarCalendario({ actividades: [terminada], excepciones: [], eventos: [], ...semana })).toEqual([]);
  });

  it("incluye los eventos del rango con su hora de fin y ordena por fecha y hora", () => {
    const eventos: EventoCalendario[] = [
      { id: "ev1", titulo: "Asamblea", fecha: dia(2026, 10, 14), hora: "18:00", duracionMin: 90, lugar: "Sede", descripcion: null, actividadId: null },
      { id: "ev2", titulo: "Fuera de rango", fecha: dia(2026, 10, 25), hora: "10:00", duracionMin: 60, lugar: null, descripcion: null, actividadId: null },
    ];
    const items = armarCalendario({ actividades: [natacion], excepciones: [], eventos, ...semana });
    expect(items.map((i) => [i.tipo, i.titulo, i.hora])).toEqual([
      ["EVENTO", "Asamblea", "18:00"],
      ["CLASE", "Natación", "19:00"],
      ["CLASE", "Natación", "08:00"],
    ]);
    expect(items[0]).toMatchObject({ estado: "NORMAL", eventoId: "ev1", lugar: "Sede", horaFin: "19:30" });
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

describe("semanaDe / lunesDeParam", () => {
  it("semanaDe devuelve de lunes a domingo la semana de la fecha", () => {
    expect(semanaDe(dia(2026, 10, 15)).map(claveDia)).toEqual([
      "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
    ]);
    expect(claveDia(semanaDe(dia(2026, 10, 18))[0])).toBe("2026-10-12");
  });

  it("lunesDeParam toma la semana del día pedido y, si es inválido, la actual", () => {
    const hoy = new Date(Date.UTC(2026, 9, 21, 15));
    expect(claveDia(lunesDeParam("2026-10-14", hoy))).toBe("2026-10-12");
    expect(claveDia(lunesDeParam("cualquier cosa", hoy))).toBe("2026-10-19");
    expect(claveDia(lunesDeParam(undefined, hoy))).toBe("2026-10-19");
  });
});

describe("bloquesSemana", () => {
  const semana = semanaDe(dia(2026, 10, 12));
  const clase = (fecha: Date, hora: string, fin: string, titulo = "Natación") => ({
    tipo: "CLASE" as const, fecha, hora, horaFin: fin, titulo, estado: "NORMAL" as const,
  });

  it("ubica cada clase por columna, minuto de inicio (desde las 8) y duración", () => {
    const r = bloquesSemana([clase(dia(2026, 10, 14), "18:00", "19:00")], semana);
    expect(r.desdeHora).toBe(8);
    expect(r.hastaHora).toBe(22);
    expect(r.bloques[0]).toMatchObject({ columna: 2, inicioMin: 600, duracionMin: 60, carril: 0, carriles: 1 });
  });

  it("los solapados del mismo día van en carriles distintos", () => {
    const r = bloquesSemana(
      [
        clase(dia(2026, 10, 14), "18:00", "19:30", "A"),
        clase(dia(2026, 10, 14), "19:00", "20:00", "B"),
        clase(dia(2026, 10, 14), "21:00", "22:00", "C"),
      ],
      semana,
    );
    expect(r.bloques.map((b) => [b.item.titulo, b.carril, b.carriles])).toEqual([["A", 0, 2], ["B", 1, 2], ["C", 0, 1]]);
  });

  it("amplía el rango de horas si hay clases temprano o tarde", () => {
    const r = bloquesSemana([clase(dia(2026, 10, 12), "07:00", "08:00"), clase(dia(2026, 10, 13), "22:30", "23:30")], semana);
    expect(r.desdeHora).toBe(7);
    expect(r.hastaHora).toBe(24);
  });

  it("un ítem que pasa la medianoche se corta al final del día y los de otras semanas se ignoran", () => {
    const r = bloquesSemana([clase(dia(2026, 10, 12), "23:30", "00:30"), clase(dia(2026, 10, 20), "10:00", "11:00")], semana);
    expect(r.bloques).toHaveLength(1);
    expect(r.bloques[0].duracionMin).toBe(30);
  });

  it("un ítem sin hora de fin dura una hora", () => {
    const r = bloquesSemana([{ ...clase(dia(2026, 10, 12), "10:00", ""), horaFin: undefined }], semana);
    expect(r.bloques[0].duracionMin).toBe(60);
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

describe("formatHorarios", () => {
  it("agrupa los días con el mismo horario, de lunes a domingo", () => {
    expect(
      formatHorarios([
        { diaSemana: 3, hora: "19:00", duracionMin: 60 },
        { diaSemana: 1, hora: "19:00", duracionMin: 60 },
      ]),
    ).toBe("Lun y Mié 19:00–20:00");
    expect(
      formatHorarios([
        { diaSemana: 0, hora: "10:00", duracionMin: 60 },
        { diaSemana: 1, hora: "19:00", duracionMin: 60 },
        { diaSemana: 3, hora: "19:00", duracionMin: 60 },
        { diaSemana: 5, hora: "19:00", duracionMin: 60 },
      ]),
    ).toBe("Lun, Mié y Vie 19:00–20:00 · Dom 10:00–11:00");
  });

  it("separa días con la misma hora pero distinta duración", () => {
    expect(
      formatHorarios([
        { diaSemana: 2, hora: "08:00", duracionMin: 45 },
        { diaSemana: 4, hora: "08:00", duracionMin: 60 },
      ]),
    ).toBe("Mar 08:00–08:45 · Jue 08:00–09:00");
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
