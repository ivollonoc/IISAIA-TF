export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export const formatPesos = (monto: number) => pesos.format(monto);

export const formatFecha = (fecha: Date) => fecha.toLocaleDateString("es-AR");

/** Día calendario de una fecha guardada como medianoche UTC (vencimientos): no se corre por zona horaria. */
export const formatDia = (fecha: Date) => fecha.toLocaleDateString("es-AR", { timeZone: "UTC" });

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const dos = (n: number) => String(n).padStart(2, "0");

/** "Mié 14/10" para un día guardado a medianoche UTC. */
export const formatDiaCorto = (fecha: Date) =>
  `${DIAS_CORTOS[fecha.getUTCDay()]} ${dos(fecha.getUTCDate())}/${dos(fecha.getUTCMonth() + 1)}`;

/** "octubre 2026" para un período "YYYY-MM". */
export const nombreMes = (periodo: string) => {
  const [anio, mes] = periodo.split("-").map(Number);
  return `${MESES[mes - 1]} ${anio}`;
};
