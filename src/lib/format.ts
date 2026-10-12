export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export const formatPesos = (monto: number) => pesos.format(monto);

export const formatFecha = (fecha: Date) => fecha.toLocaleDateString("es-AR");

/** Día calendario de una fecha guardada como medianoche UTC (vencimientos): no se corre por zona horaria. */
export const formatDia = (fecha: Date) => fecha.toLocaleDateString("es-AR", { timeZone: "UTC" });
