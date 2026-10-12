// Reglas puras de cuenta corriente (sin I/O) para poder testearlas aisladas.
import { inicioDelDia, OFFSET_UTC_HORAS, PERIODO_REGEX, periodoActual, periodoSiguiente } from "@/lib/periodo";

// Helpers de días compartidos con otros módulos (viven en lib/periodo).
export { inicioDelDia, periodoAnterior, periodoSiguiente } from "@/lib/periodo";

type EstadoCargoStr = "PENDIENTE" | "PAGADO" | "ANULADO";

/** Vencimiento de un período ("YYYY-MM") según el día de vencimiento del club (1..28). */
export function vencimiento(periodo: string, dia: number): Date {
  if (!PERIODO_REGEX.test(periodo)) throw new Error(`Período inválido: ${periodo}`);
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) throw new Error(`Día de vencimiento inválido: ${dia}`);
  const [anio, mes] = periodo.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/** Períodos para los que se pueden generar cargos: el actual y el siguiente. */
export function periodosGenerables(hoy: Date = new Date()): [string, string] {
  const actual = periodoActual(hoy);
  return [actual, periodoSiguiente(actual)];
}

/** Instantes del mes de un período en Argentina: [medianoche del día 1, medianoche del 1 del mes siguiente). */
export function rangoDelMes(periodo: string): { desde: Date; hasta: Date } {
  const [anio, mes] = periodo.split("-").map(Number);
  return {
    desde: new Date(Date.UTC(anio, mes - 1, 1, OFFSET_UTC_HORAS)),
    hasta: new Date(Date.UTC(anio, mes, 1, OFFSET_UTC_HORAS)),
  };
}

/** Un cargo pendiente está vencido si su vencimiento es anterior a hoy (el que vence hoy todavía no). */
export function estaVencido(cargo: { estado: EstadoCargoStr; vencimiento: Date }, hoy: Date = new Date()): boolean {
  return cargo.estado === "PENDIENTE" && cargo.vencimiento.getTime() < inicioDelDia(hoy).getTime();
}

/** Un socio está al día si no tiene cargos vencidos impagos. */
export function estaAlDia(cargos: { estado: EstadoCargoStr; vencimiento: Date }[], hoy: Date = new Date()): boolean {
  return !cargos.some((c) => estaVencido(c, hoy));
}

export interface Movimiento {
  id: string;
  fecha: Date;
  tipo: "CARGO" | "PAGO";
  concepto: string;
  monto: number;
  anulado: boolean;
}

/** Ordena por fecha (a igual fecha, el cargo antes que el pago) y agrega el saldo; los anulados no suman. */
export function saldoAcumulado<T extends Movimiento>(movs: T[]): (T & { saldo: number })[] {
  const orden = [...movs].sort(
    (a, b) => a.fecha.getTime() - b.fecha.getTime() || (a.tipo === b.tipo ? 0 : a.tipo === "CARGO" ? -1 : 1),
  );
  let saldo = 0;
  return orden.map((m) => {
    if (!m.anulado) saldo += m.tipo === "CARGO" ? m.monto : -m.monto;
    return { ...m, saldo };
  });
}
