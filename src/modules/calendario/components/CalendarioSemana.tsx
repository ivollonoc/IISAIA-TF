import Link from "next/link";
import { formatDiaCorto } from "@/lib/format";
import { bloquesSemana, claveDia, type ItemCalendario } from "../reglas";
import { AgendaLista } from "./AgendaLista";
import { claveItem, detalleItem } from "./etiquetas";

const ALTO_HORA = 48; // px por hora

const estiloBloque: Record<string, string> = {
  NORMAL: "border-slate-300 bg-slate-50 text-slate-800",
  SUSPENDIDA: "border-red-200 bg-red-50 text-red-700 line-through",
  MOVIDA: "border-slate-200 bg-white text-slate-400 line-through",
  REPROGRAMADA: "border-amber-300 bg-amber-50 text-amber-800",
  EVENTO: "border-primario-300 bg-primario-50 text-primario-800",
};

/** Grilla semanal por horas (desde md) y agenda (en celular) con los mismos ítems. */
export function CalendarioSemana({
  dias,
  items,
  hoy,
  hrefItem,
}: {
  dias: Date[];
  items: ItemCalendario[];
  hoy: Date;
  hrefItem?: (i: ItemCalendario) => string;
}) {
  const { desdeHora, hastaHora, bloques } = bloquesSemana(items, dias);
  const horas = Array.from({ length: hastaHora - desdeHora }, (_, i) => desdeHora + i);
  const alto = horas.length * ALTO_HORA;

  return (
    <>
      <div className="hidden md:block">
        <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] pb-1 text-center text-xs font-medium text-slate-500">
          <span />
          {dias.map((d) => (
            <span key={claveDia(d)} className={claveDia(d) === claveDia(hoy) ? "font-bold text-primario-700" : ""}>
              {formatDiaCorto(d)}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] overflow-hidden rounded-lg border border-slate-200">
          <div className="relative border-r border-slate-200 bg-slate-50" style={{ height: alto }}>
            {horas.map((h, i) => (
              <span key={h} className="absolute right-1 -translate-y-1/2 text-[10px] text-slate-400" style={{ top: i * ALTO_HORA }}>
                {i > 0 ? `${String(h % 24).padStart(2, "0")}:00` : ""}
              </span>
            ))}
          </div>
          {dias.map((d, columna) => (
            <div
              key={claveDia(d)}
              className={`relative border-r border-slate-100 last:border-r-0 ${claveDia(d) === claveDia(hoy) ? "bg-primario-50/40" : "bg-white"}`}
              style={{
                height: alto,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${ALTO_HORA - 1}px, rgb(241 245 249) ${ALTO_HORA - 1}px, rgb(241 245 249) ${ALTO_HORA}px)`,
              }}
            >
              {bloques
                .filter((b) => b.columna === columna)
                .map((b) => {
                  const estilo = b.item.tipo === "EVENTO" ? estiloBloque.EVENTO : estiloBloque[b.item.estado];
                  const contenido = (
                    <>
                      <span className="block font-semibold">{b.item.titulo}</span>
                      <span className="block opacity-80">
                        {b.item.hora}
                        {b.item.horaFin ? `–${b.item.horaFin}` : ""}
                      </span>
                    </>
                  );
                  return (
                    <div
                      key={claveItem(b.item)}
                      title={detalleItem(b.item)}
                      className={`absolute overflow-hidden rounded-md border px-1.5 py-0.5 text-[11px] leading-tight shadow-sm ${estilo}`}
                      style={{
                        top: (b.inicioMin / 60) * ALTO_HORA + 1,
                        height: Math.max((b.duracionMin / 60) * ALTO_HORA - 2, 18),
                        left: `calc(${(b.carril / b.carriles) * 100}% + 2px)`,
                        width: `calc(${100 / b.carriles}% - 4px)`,
                      }}
                    >
                      {hrefItem ? (
                        <Link href={hrefItem(b.item)} className="block h-full hover:underline">
                          {contenido}
                        </Link>
                      ) : (
                        contenido
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
      <div className="md:hidden">
        <AgendaLista items={items} hrefItem={hrefItem} vacio="Sin clases ni eventos esta semana." />
      </div>
    </>
  );
}
