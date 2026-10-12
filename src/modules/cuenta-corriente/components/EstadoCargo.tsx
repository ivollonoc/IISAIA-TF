import type { EstadoCargo as Estado } from "@prisma/client";

const estilos = {
  Pendiente: "bg-amber-100 text-amber-800",
  Vencido: "bg-red-100 text-red-800",
  Pagado: "bg-emerald-100 text-emerald-800",
  Anulado: "bg-slate-100 text-slate-500",
} as const;

/** Estado de un cargo; un pendiente con vencimiento pasado se muestra como "Vencido". */
export function EstadoCargo({ estado, vencido }: { estado: Estado; vencido: boolean }) {
  const etiqueta =
    estado === "PENDIENTE" ? (vencido ? "Vencido" : "Pendiente") : estado === "PAGADO" ? "Pagado" : "Anulado";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${estilos[etiqueta]}`}>{etiqueta}</span>;
}
