// Reglas puras del calendario (sin I/O). Los días son fechas a medianoche UTC del calendario
// de Argentina; el día de la semana se lee con getUTCDay(). Las horas son "HH:MM" locales.
import { DIA_MS, inicioDelDia, PERIODO_REGEX, periodoActual } from "@/lib/periodo";

export type EstadoItem = "NORMAL" | "SUSPENDIDA" | "MOVIDA" | "REPROGRAMADA";

export interface ItemCalendario {
  tipo: "CLASE" | "EVENTO";
  fecha: Date;
  hora: string;
  horaFin?: string;
  titulo: string;
  estado: EstadoItem;
  motivo?: string;
  fechaOriginal?: Date;
  horaOriginal?: string; // REPROGRAMADA: hora de la clase original
  destino?: { fecha: Date; hora: string };
  actividadId?: string;
  excepcionId?: string;
  eventoId?: string;
  lugar?: string;
  descripcion?: string;
}

export interface HorarioCalendario {
  diaSemana: number;
  hora: string;
  duracionMin: number;
}

export interface ActividadCalendario {
  id: string;
  nombre: string;
  activa: boolean;
  fechaInicio: Date;
  fechaFin: Date | null;
  horarios: HorarioCalendario[];
}

type Vigencia = Pick<ActividadCalendario, "fechaInicio" | "fechaFin" | "horarios">;

export interface ExcepcionCalendario {
  id: string;
  actividadId: string;
  fecha: Date;
  hora: string; // hora original de la clase (un día puede tener varias)
  tipo: "SUSPENDIDA" | "REPROGRAMADA";
  nuevaFecha: Date | null;
  nuevaHora: string | null;
  motivo: string;
}

export interface EventoCalendario {
  id: string;
  titulo: string;
  fecha: Date;
  hora: string;
  duracionMin: number;
  lugar: string | null;
  descripcion: string | null;
  actividadId: string | null;
}

/** "AAAA-MM-DD" → medianoche UTC; null si el formato es inválido o la fecha no existe. */
export function parsearDia(texto: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const fecha = new Date(`${texto}T00:00:00Z`);
  return Number.isNaN(fecha.getTime()) || claveDia(fecha) !== texto ? null : fecha;
}

export const claveDia = (fecha: Date) => fecha.toISOString().slice(0, 10);

/** Mes a mostrar: el del parámetro ?mes=YYYY-MM si es válido (años 2000–2100); si no, el actual. */
export function mesDeParam(param: string | undefined, hoy: Date = new Date()): string {
  const anio = Number(param?.slice(0, 4));
  return param && PERIODO_REGEX.test(param) && anio >= 2000 && anio <= 2100 ? param : periodoActual(hoy);
}

/**
 * Clases de la actividad dentro de [desde, hasta] y de su vigencia: una por cada horario de cada
 * día (un día puede tener varios), ordenadas por fecha y hora.
 */
export function clasesEnRango(actividad: Vigencia, desde: Date, hasta: Date): { fecha: Date; horario: HorarioCalendario }[] {
  const inicio = Math.max(desde.getTime(), actividad.fechaInicio.getTime());
  const fin = Math.min(hasta.getTime(), actividad.fechaFin?.getTime() ?? Infinity);
  const ordenados = [...actividad.horarios].sort((a, b) => a.hora.localeCompare(b.hora));
  const clases: { fecha: Date; horario: HorarioCalendario }[] = [];
  for (let t = inicio; t <= fin; t += DIA_MS) {
    const fecha = new Date(t);
    for (const horario of ordenados) if (horario.diaSemana === fecha.getUTCDay()) clases.push({ fecha, horario });
  }
  return clases;
}

/** Horario de la clase de esa fecha y hora, o null si no hay clase (otro día u hora, o fuera de vigencia). */
export function horarioDe(actividad: Vigencia, fecha: Date, hora: string): HorarioCalendario | null {
  return clasesEnRango(actividad, fecha, fecha).find((c) => c.horario.hora === hora)?.horario ?? null;
}

/** Hora de fin "HH:MM" (da la vuelta a medianoche). */
export function horaFin(hora: string, duracionMin: number): string {
  const [h, m] = hora.split(":").map(Number);
  const total = (h * 60 + m + duracionMin) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Clases de la regla con sus excepciones, más los eventos, ordenados por fecha y hora. */
export function armarCalendario({
  actividades,
  excepciones,
  eventos,
  desde,
  hasta,
}: {
  actividades: ActividadCalendario[];
  excepciones: ExcepcionCalendario[];
  eventos: EventoCalendario[];
  desde: Date;
  hasta: Date;
}): ItemCalendario[] {
  const enRango = (f: Date) => f.getTime() >= desde.getTime() && f.getTime() <= hasta.getTime();
  const activas = new Map(actividades.filter((a) => a.activa).map((a) => [a.id, a]));
  const clave = (actividadId: string, fecha: Date, hora: string) => `${actividadId}|${claveDia(fecha)}|${hora}`;
  const porClase = new Map(excepciones.map((e) => [clave(e.actividadId, e.fecha, e.hora), e]));
  const items: ItemCalendario[] = [];

  for (const a of activas.values()) {
    for (const { fecha, horario } of clasesEnRango(a, desde, hasta)) {
      const base = {
        tipo: "CLASE" as const, fecha, hora: horario.hora, horaFin: horaFin(horario.hora, horario.duracionMin),
        titulo: a.nombre, actividadId: a.id,
      };
      const exc = porClase.get(clave(a.id, fecha, horario.hora));
      if (!exc) items.push({ ...base, estado: "NORMAL" });
      else if (exc.tipo === "SUSPENDIDA") items.push({ ...base, estado: "SUSPENDIDA", motivo: exc.motivo, excepcionId: exc.id });
      else
        items.push({
          ...base, estado: "MOVIDA", motivo: exc.motivo, excepcionId: exc.id,
          destino: { fecha: exc.nuevaFecha!, hora: exc.nuevaHora! },
        });
    }
  }

  for (const exc of excepciones) {
    const a = activas.get(exc.actividadId);
    if (!a || exc.tipo !== "REPROGRAMADA" || !exc.nuevaFecha || !exc.nuevaHora || !enRango(exc.nuevaFecha)) continue;
    const duracion = horarioDe(a, exc.fecha, exc.hora)?.duracionMin ?? 60;
    items.push({
      tipo: "CLASE", fecha: exc.nuevaFecha, hora: exc.nuevaHora, horaFin: horaFin(exc.nuevaHora, duracion),
      titulo: a.nombre, estado: "REPROGRAMADA", motivo: exc.motivo, fechaOriginal: exc.fecha, horaOriginal: exc.hora,
      actividadId: a.id, excepcionId: exc.id,
    });
  }

  for (const ev of eventos) {
    if (!enRango(ev.fecha)) continue;
    items.push({
      tipo: "EVENTO", fecha: ev.fecha, hora: ev.hora, horaFin: horaFin(ev.hora, ev.duracionMin),
      titulo: ev.titulo, estado: "NORMAL", eventoId: ev.id,
      lugar: ev.lugar ?? undefined, descripcion: ev.descripcion ?? undefined,
    });
  }

  return items.sort(
    (x, y) => x.fecha.getTime() - y.fecha.getTime() || x.hora.localeCompare(y.hora) || x.titulo.localeCompare(y.titulo),
  );
}

/** Grilla del mes: semanas de lunes a domingo que cubren todos sus días. */
export function semanasDelMes(periodo: string): Date[][] {
  const [anio, mes] = periodo.split("-").map(Number);
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  const ultimo = new Date(Date.UTC(anio, mes, 0));
  const desde = primero.getTime() - ((primero.getUTCDay() + 6) % 7) * DIA_MS;
  const hasta = ultimo.getTime() + ((7 - ultimo.getUTCDay()) % 7) * DIA_MS;
  const semanas: Date[][] = [];
  for (let t = desde; t <= hasta; t += 7 * DIA_MS) {
    semanas.push(Array.from({ length: 7 }, (_, i) => new Date(t + i * DIA_MS)));
  }
  return semanas;
}

/** Los 7 días (lunes a domingo) de la semana que contiene la fecha. */
export function semanaDe(fecha: Date): Date[] {
  const lunes = fecha.getTime() - ((fecha.getUTCDay() + 6) % 7) * DIA_MS;
  return Array.from({ length: 7 }, (_, i) => new Date(lunes + i * DIA_MS));
}

/** Lunes de la semana a mostrar: la del parámetro ?semana=AAAA-MM-DD si es válido; si no, la actual. */
export function lunesDeParam(param: string | undefined, hoy: Date = new Date()): Date {
  const fecha = (param && parsearDia(param)) || inicioDelDia(hoy);
  return semanaDe(fecha)[0];
}

const minutos = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

export interface BloqueSemana {
  item: ItemCalendario;
  columna: number; // 0 = lunes
  inicioMin: number; // minutos desde desdeHora
  duracionMin: number;
  carril: number;
  carriles: number;
}

/**
 * Ubicación de los ítems en la grilla semanal: columna por día, posición y alto por hora. Rango de
 * 8 a 22 h, ampliado para que entren todos. Los que se superponen el mismo día se reparten en
 * carriles (columnas angostas). Un ítem que pasa la medianoche se corta a las 24 h.
 */
export function bloquesSemana(
  items: ItemCalendario[],
  dias: Date[],
): { desdeHora: number; hastaHora: number; bloques: BloqueSemana[] } {
  const columnas = new Map(dias.map((d, i) => [d.getTime(), i]));
  const crudos = items
    .filter((item) => columnas.has(item.fecha.getTime()))
    .map((item) => {
      const inicio = minutos(item.hora);
      const fin = item.horaFin ? minutos(item.horaFin) : inicio + 60;
      return { item, columna: columnas.get(item.fecha.getTime())!, inicio, fin: fin > inicio ? fin : 24 * 60 };
    })
    .sort((a, b) => a.columna - b.columna || a.inicio - b.inicio);

  const desdeHora = Math.min(8, ...crudos.map((c) => Math.floor(c.inicio / 60)));
  const hastaHora = Math.max(22, ...crudos.map((c) => Math.ceil(c.fin / 60)));

  // Carriles: grupos de ítems que se superponen (en cadena) dentro del mismo día.
  const bloques: BloqueSemana[] = [];
  let grupo: (typeof crudos[number] & { carril: number })[] = [];
  let finGrupo = -1;
  const cerrar = () => {
    const carriles = Math.max(0, ...grupo.map((g) => g.carril)) + 1;
    for (const g of grupo) {
      bloques.push({
        item: g.item, columna: g.columna, inicioMin: g.inicio - desdeHora * 60, duracionMin: g.fin - g.inicio,
        carril: g.carril, carriles,
      });
    }
    grupo = [];
  };
  for (const c of crudos) {
    if (grupo.length && (c.columna !== grupo[0].columna || c.inicio >= finGrupo)) cerrar();
    const ocupados = new Set(grupo.filter((g) => g.fin > c.inicio).map((g) => g.carril));
    let carril = 0;
    while (ocupados.has(carril)) carril++;
    grupo.push({ ...c, carril });
    finGrupo = grupo.length === 1 ? c.fin : Math.max(finGrupo, c.fin);
  }
  if (grupo.length) cerrar();
  return { desdeHora, hastaHora, bloques };
}
