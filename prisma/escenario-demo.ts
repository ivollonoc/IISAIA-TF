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
