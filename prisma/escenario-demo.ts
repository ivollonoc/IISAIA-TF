// Períodos de la demo: uno ya vencido (para mostrar un socio moroso) y otro por vencer
// (deuda que se puede pagar sin estar en mora), sea cual sea el día en que se corra el seed.
import { fechaLocal, periodoActual } from "../src/lib/periodo";
import { periodoAnterior, periodoSiguiente } from "../src/modules/cuenta-corriente/reglas";

export function escenarioDemo(hoy: Date = new Date()): { vencido: string; porVencer: string; diaVencimiento: number } {
  const { dia } = fechaLocal(hoy);
  const actual = periodoActual(hoy);
  // Hasta el 21 el vencimiento del mes en curso puede caer una semana adelante (máximo 28);
  // después, el mes en curso pasa a ser el vencido y el "por vencer" es el siguiente.
  if (dia <= 21) return { vencido: periodoAnterior(actual), porVencer: actual, diaVencimiento: dia + 7 };
  return { vencido: actual, porVencer: periodoSiguiente(actual), diaVencimiento: 10 };
}
