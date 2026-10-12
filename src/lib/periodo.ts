// Un período de cuota es un mes calendario con formato "YYYY-MM".

export const PERIODO_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export function periodoActual(fecha: Date = new Date()): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}`;
}
