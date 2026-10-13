export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export const formatPesos = (monto: number) => pesos.format(monto);

/** Día calendario de una fecha guardada como medianoche UTC (vencimientos): no se corre por zona horaria. */
export const formatDia = (fecha: Date) => fecha.toLocaleDateString("es-AR", { timeZone: "UTC" });

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const dos = (n: number) => String(n).padStart(2, "0");

/** "12/10/2026 20:15": fecha y hora de Argentina (UTC-3, sin horario de verano) de un instante. */
export const formatFechaHora = (instante: Date) => {
  const local = new Date(instante.getTime() - 3 * 60 * 60 * 1000);
  return `${dos(local.getUTCDate())}/${dos(local.getUTCMonth() + 1)}/${local.getUTCFullYear()} ${dos(local.getUTCHours())}:${dos(local.getUTCMinutes())}`;
};

/** "Mié 14/10" para un día guardado a medianoche UTC. */
export const formatDiaCorto = (fecha: Date) =>
  `${DIAS_CORTOS[fecha.getUTCDay()]} ${dos(fecha.getUTCDate())}/${dos(fecha.getUTCMonth() + 1)}`;

/** "Miércoles 14 de octubre" para un día guardado a medianoche UTC. */
export const formatDiaLargo = (fecha: Date) => `${DIAS[fecha.getUTCDay()]} ${fecha.getUTCDate()} de ${MESES[fecha.getUTCMonth()]}`;

/** "octubre 2026" para un período "YYYY-MM". */
export const nombreMes = (periodo: string) => {
  const [anio, mes] = periodo.split("-").map(Number);
  return `${MESES[mes - 1]} ${anio}`;
};
