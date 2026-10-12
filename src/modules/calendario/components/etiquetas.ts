// Textos de un ítem del calendario: corto para la grilla y completo para la agenda.
import { formatDiaCorto } from "@/lib/format";
import type { ItemCalendario } from "../reglas";

export function etiquetaItem(item: ItemCalendario): string {
  const base = `${item.hora} ${item.titulo}`;
  if (item.estado === "SUSPENDIDA") return `${base} (suspendida)`;
  if (item.estado === "MOVIDA" && item.destino) return `${base} → ${formatDiaCorto(item.destino.fecha)} ${item.destino.hora}`;
  if (item.estado === "REPROGRAMADA") return `${base} (reprogramada)`;
  return base;
}

export function detalleItem(item: ItemCalendario): string {
  const horario = item.horaFin ? `${item.hora}–${item.horaFin}` : item.hora;
  const base = `${horario} ${item.titulo}`;
  if (item.estado === "SUSPENDIDA") return `${base} · Suspendida: ${item.motivo}`;
  if (item.estado === "MOVIDA" && item.destino)
    return `${base} · Reprogramada al ${formatDiaCorto(item.destino.fecha)} ${item.destino.hora}: ${item.motivo}`;
  if (item.estado === "REPROGRAMADA" && item.fechaOriginal)
    return `${base} · Reprogramada desde ${formatDiaCorto(item.fechaOriginal)}: ${item.motivo}`;
  if (item.lugar) return `${base} · ${item.lugar}`;
  return base;
}
