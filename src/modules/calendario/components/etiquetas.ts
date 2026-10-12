// Textos de un ítem del calendario: corto para la grilla y completo para la agenda.
import { formatDiaCorto } from "@/lib/format";
import { claveDia, horaFin, type HorarioCalendario, type ItemCalendario } from "../reglas";

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const ordenSemana = (diaSemana: number) => (diaSemana + 6) % 7; // lunes primero

/** "Lun, Mié y Vie 19:00–20:00 · Dom 10:00–11:00": agrupa los días con el mismo horario. */
export function formatHorarios(horarios: HorarioCalendario[]): string {
  const grupos = new Map<string, number[]>();
  for (const h of [...horarios].sort((a, b) => ordenSemana(a.diaSemana) - ordenSemana(b.diaSemana))) {
    const rango = `${h.hora}–${horaFin(h.hora, h.duracionMin)}`;
    grupos.set(rango, [...(grupos.get(rango) ?? []), h.diaSemana]);
  }
  return [...grupos]
    .map(([rango, dias]) => {
      const nombres = dias.map((d) => DIAS_CORTOS[d]);
      const lista = nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}` : nombres[0];
      return `${lista} ${rango}`;
    })
    .join(" · ");
}

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

/** Clave única de un ítem dentro de un día (para las listas de React). */
export function claveItem(item: ItemCalendario): string {
  const origen = item.excepcionId ?? (item.fechaOriginal ? claveDia(item.fechaOriginal) : "");
  return [item.tipo, item.actividadId ?? item.eventoId, item.estado, item.hora, origen].join("|");
}

/** Estado de la clase seleccionada en el panel del admin. */
export function estadoClase(
  excepcion: { tipo: "SUSPENDIDA" | "REPROGRAMADA"; motivo: string; nuevaFecha: Date | null; nuevaHora: string | null } | null,
): string {
  if (!excepcion) return "Estado: normal";
  if (excepcion.tipo === "SUSPENDIDA") return `Suspendida: ${excepcion.motivo}`;
  return `Reprogramada al ${formatDiaCorto(excepcion.nuevaFecha!)} ${excepcion.nuevaHora}: ${excepcion.motivo}`;
}
