import Link from "next/link";
import { claveDia, semanasDelMes, type ItemCalendario } from "../reglas";
import { AgendaLista, claseDeItem } from "./AgendaLista";
import { claveItem, detalleItem, etiquetaItem } from "./etiquetas";

const CABECERA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Grilla mensual (desde md) y agenda (en celular) con los mismos ítems. */
export function CalendarioMes({
  periodo,
  items,
  hoy,
  hrefItem,
}: {
  periodo: string;
  items: ItemCalendario[];
  hoy: Date;
  hrefItem?: (i: ItemCalendario) => string;
}) {
  const porDia = new Map<string, ItemCalendario[]>();
  for (const i of items) porDia.set(claveDia(i.fecha), [...(porDia.get(claveDia(i.fecha)) ?? []), i]);
  const delMes = items.filter((i) => claveDia(i.fecha).startsWith(periodo));

  return (
    <>
      <div className="hidden md:block">
        <div className="grid grid-cols-7 pb-1 text-center text-xs font-medium text-slate-500">
          {CABECERA.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
          {semanasDelMes(periodo)
            .flat()
            .map((dia) => {
              const clave = claveDia(dia);
              const esHoy = clave === claveDia(hoy);
              const fuera = !clave.startsWith(periodo);
              return (
                <div key={clave} className={`min-h-24 p-1.5 ${fuera ? "bg-slate-50 opacity-60" : "bg-white"}`}>
                  <p className={`text-xs ${esHoy ? "font-bold text-emerald-700" : "text-slate-500"}`}>{dia.getUTCDate()}</p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                    {(porDia.get(clave) ?? []).map((i) => (
                      <li
                        key={claveItem(i)}
                        className={`truncate ${claseDeItem(i)}`}
                        title={detalleItem(i)}
                      >
                        {hrefItem ? (
                          <Link href={hrefItem(i)} className="hover:underline">
                            {etiquetaItem(i)}
                          </Link>
                        ) : (
                          etiquetaItem(i)
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
        </div>
      </div>
      <div className="md:hidden">
        <AgendaLista items={delMes} hrefItem={hrefItem} vacio="Sin clases ni eventos este mes." />
      </div>
    </>
  );
}
