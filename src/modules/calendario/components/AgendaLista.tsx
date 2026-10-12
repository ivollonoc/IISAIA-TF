import Link from "next/link";
import { formatDiaCorto } from "@/lib/format";
import { claveDia, type ItemCalendario } from "../reglas";
import { detalleItem } from "./etiquetas";

export const estiloItem: Record<string, string> = {
  NORMAL: "text-slate-700",
  SUSPENDIDA: "text-red-700 line-through",
  MOVIDA: "text-slate-400 line-through",
  REPROGRAMADA: "text-amber-700",
  EVENTO: "text-emerald-700 font-medium",
};

export const claseDeItem = (i: ItemCalendario) => (i.tipo === "EVENTO" ? estiloItem.EVENTO : estiloItem[i.estado]);

/** Ítems agrupados por día, con el texto completo (horario, estado y motivo). */
export function AgendaLista({
  items,
  hrefItem,
  vacio = "Sin clases ni eventos.",
}: {
  items: ItemCalendario[];
  hrefItem?: (i: ItemCalendario) => string;
  vacio?: string;
}) {
  if (items.length === 0) return <p className="text-sm text-slate-500">{vacio}</p>;
  const dias = new Map<string, ItemCalendario[]>();
  for (const i of items) dias.set(claveDia(i.fecha), [...(dias.get(claveDia(i.fecha)) ?? []), i]);
  return (
    <ul className="flex flex-col gap-3">
      {[...dias.values()].map((delDia) => (
        <li key={claveDia(delDia[0].fecha)}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{formatDiaCorto(delDia[0].fecha)}</p>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {delDia.map((i) => (
              <li key={`${i.tipo}-${i.actividadId ?? i.eventoId}-${i.estado}-${i.hora}`} className={claseDeItem(i)}>
                {hrefItem ? (
                  <Link href={hrefItem(i)} className="hover:underline">
                    {detalleItem(i)}
                  </Link>
                ) : (
                  detalleItem(i)
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
