export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export const formatPesos = (monto: number) => pesos.format(monto);

export const formatFecha = (fecha: Date) => fecha.toLocaleDateString("es-AR");
