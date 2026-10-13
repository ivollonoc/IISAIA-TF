// Escenario de la demo. Períodos: uno ya vencido (para mostrar un socio moroso) y otro por vencer
// (deuda que se puede pagar sin estar en mora), sea cual sea el día en que se corra el seed.
import { DIA_MS, fechaLocal, inicioDelDia, periodoActual } from "../src/lib/periodo";
import { clasesEnRango } from "../src/modules/calendario/reglas";
import { periodoAnterior, periodoSiguiente } from "../src/modules/cuenta-corriente/reglas";

export function escenarioDemo(hoy: Date = new Date()): { vencido: string; porVencer: string; diaVencimiento: number } {
  const { dia } = fechaLocal(hoy);
  const actual = periodoActual(hoy);
  // Hasta el 21 el vencimiento del mes en curso puede caer una semana adelante (máximo 28);
  // después, el mes en curso pasa a ser el vencido y el "por vencer" es el siguiente.
  if (dia <= 21) return { vencido: periodoAnterior(actual), porVencer: actual, diaVencimiento: dia + 7 };
  return { vencido: actual, porVencer: periodoSiguiente(actual), diaVencimiento: 10 };
}

const HORA_MS = 60 * 60 * 1000;
/** Instante de un día (medianoche UTC) a cierta hora de Argentina (UTC-3). */
const aLas = (dia: Date, hora: number, minutos = 0) => new Date(dia.getTime() + (hora + 3) * HORA_MS + minutos * 60_000);

/**
 * Fechas realistas para los cargos y pagos del seed (que no queden todos "ahora"): los cargos se
 * crean el día 1 de su período a las 9:00 (o ayer, si el período todavía no empezó); los pagos del
 * período vencido, un par de días antes del vencimiento en horario de atención; y los del período
 * por vencer, en los últimos días. `k` distingue a cada socio que paga.
 */
export function fechasDemo(e: { vencido: string; porVencer: string; diaVencimiento: number }, hoy: Date = new Date()) {
  const hoyDia = inicioDelDia(hoy);
  const ayer = aLas(new Date(hoyDia.getTime() - DIA_MS), 9);
  const cargo = (periodo: string) => {
    const [anio, mes] = periodo.split("-").map(Number);
    const primero = aLas(new Date(Date.UTC(anio, mes - 1, 1)), 9);
    return primero.getTime() < hoy.getTime() - HORA_MS ? primero : ayer;
  };
  const despuesDe = (candidato: Date, minimo: Date, k: number) =>
    candidato.getTime() > minimo.getTime() ? candidato : new Date(minimo.getTime() + (k + 1) * 30 * 60_000);

  const [anioV, mesV] = e.vencido.split("-").map(Number);
  const venceVencido = new Date(Date.UTC(anioV, mesV - 1, e.diaVencimiento));
  return {
    cargo,
    pagoVencido: (k: number) => despuesDe(aLas(new Date(venceVencido.getTime() - 2 * DIA_MS), 10 + 2 * k, 15 * k), cargo(e.vencido), k),
    pagoPorVencer: (k: number) =>
      despuesDe(aLas(new Date(hoyDia.getTime() - (k + 1) * DIA_MS), 11 + 3 * k, 20), cargo(e.porVencer), k),
  };
}

/** Día de la semana de "Fútbol infantil" en el seed (lunes). */
const DIA_FUTBOL = 1;

/**
 * Calendario de la demo: las actividades existen desde el inicio del mes anterior (así no hay
 * semanas vacías) y los cambios del seed caen sobre Fútbol: su clase de esta semana suspendida y
 * la de la semana siguiente reprogramada al día después. La Natación de esta semana queda libre
 * para que el admin la reprograme durante la demo y la socia lo vea en "Próximos 7 días".
 */
export function calendarioDemo(hoy: Date = new Date()) {
  const { anio, mes } = fechaLocal(hoy);
  const creadas = new Date(Date.UTC(anio, mes - 2, 1));
  const hoyDia = inicioDelDia(hoy);
  const [{ fecha: suspendida }] = clasesEnRango(
    { horarios: [{ diaSemana: DIA_FUTBOL, hora: "18:00", duracionMin: 60 }], fechaInicio: creadas, fechaFin: null },
    hoyDia,
    new Date(hoyDia.getTime() + 6 * DIA_MS),
  );
  const fecha = new Date(suspendida.getTime() + 7 * DIA_MS);
  return { creadas, futbol: { suspendida, reprogramada: { fecha, nuevaFecha: new Date(fecha.getTime() + DIA_MS) } } };
}
