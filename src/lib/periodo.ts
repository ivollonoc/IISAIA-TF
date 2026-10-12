// Un período de cuota es un mes calendario con formato "YYYY-MM".
// Días y meses se calculan en la zona horaria de los clubes (Argentina), no con el reloj del
// servidor: en Vercel el servidor corre en UTC y desde las 21 h ya sería "mañana".

export const PERIODO_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";
/** Argentina no tiene horario de verano: la medianoche local son las 03:00 UTC. */
export const OFFSET_UTC_HORAS = 3;

const formatoFecha = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Año, mes (1..12) y día calendario de `fecha` en Argentina. */
export function fechaLocal(fecha: Date = new Date()): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = formatoFecha.format(fecha).split("-").map(Number);
  return { anio, mes, dia };
}

export function periodoActual(fecha: Date = new Date()): string {
  const { anio, mes } = fechaLocal(fecha);
  return `${anio}-${String(mes).padStart(2, "0")}`;
}
