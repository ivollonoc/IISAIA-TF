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
  destino?: { fecha: Date; hora: string };
  actividadId?: string;
  excepcionId?: string;
  eventoId?: string;
  lugar?: string;
  descripcion?: string;
}

export interface ActividadCalendario {
  id: string;
  nombre: string;
  diaSemana: number;
  hora: string;
  duracionMin: number;
  activa: boolean;
  createdAt: Date;
}

export interface ExcepcionCalendario {
  id: string;
  actividadId: string;
  fecha: Date;
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

/** Fechas de la regla semanal dentro de [desde, hasta], sin clases anteriores a la creación. */
export function clasesEnRango(actividad: { diaSemana: number; createdAt: Date }, desde: Date, hasta: Date): Date[] {
  const inicio = Math.max(desde.getTime(), inicioDelDia(actividad.createdAt).getTime());
  const fechas: Date[] = [];
  for (let t = inicio; t <= hasta.getTime(); t += DIA_MS) {
    const fecha = new Date(t);
    if (fecha.getUTCDay() === actividad.diaSemana) fechas.push(fecha);
  }
  return fechas;
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
  const porClase = new Map(excepciones.map((e) => [`${e.actividadId}|${claveDia(e.fecha)}`, e]));
  const items: ItemCalendario[] = [];

  for (const a of activas.values()) {
    for (const fecha of clasesEnRango(a, desde, hasta)) {
      const base = {
        tipo: "CLASE" as const, fecha, hora: a.hora, horaFin: horaFin(a.hora, a.duracionMin),
        titulo: a.nombre, actividadId: a.id,
      };
      const exc = porClase.get(`${a.id}|${claveDia(fecha)}`);
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
    items.push({
      tipo: "CLASE", fecha: exc.nuevaFecha, hora: exc.nuevaHora, horaFin: horaFin(exc.nuevaHora, a.duracionMin),
      titulo: a.nombre, estado: "REPROGRAMADA", motivo: exc.motivo, fechaOriginal: exc.fecha,
      actividadId: a.id, excepcionId: exc.id,
    });
  }

  for (const ev of eventos) {
    if (!enRango(ev.fecha)) continue;
    items.push({
      tipo: "EVENTO", fecha: ev.fecha, hora: ev.hora, titulo: ev.titulo, estado: "NORMAL", eventoId: ev.id,
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
