import Link from "next/link";
import { formatDiaCorto, nombreMes } from "@/lib/format";
import { DIA_MS, periodoAnterior, periodoSiguiente } from "@/lib/periodo";
import { claveDia, parsearDia } from "../reglas";
import { hrefAgenda, type Vista, type VistaAgenda } from "../vista";

const ETIQUETAS: Record<Vista, string> = { semana: "Semana", mes: "Mes", lista: "Lista" };

/** Botones Semana · Mes · Lista. `vistas` permite ocultar alguna (el socio no tiene Lista). */
export function SelectorVista({ base, v, vistas = ["semana", "mes", "lista"] }: { base: string; v: VistaAgenda; vistas?: Vista[] }) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-sm">
      {vistas.map((vista) => (
        <Link
          key={vista}
          href={hrefAgenda(base, { ...v, vista })}
          className={`px-3 py-1.5 ${vista === v.vista ? "bg-primario text-sobre-primario" : "bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          {ETIQUETAS[vista]}
        </Link>
      ))}
    </div>
  );
}

/** "← · Lun 12/10 – Dom 18/10 · →" y "Hoy". */
export function NavegacionSemana({ base, v, hoy }: { base: string; v: VistaAgenda; hoy: Date }) {
  const lunes = parsearDia(v.semana)!;
  const mover = (dias: number) => {
    const semana = claveDia(new Date(lunes.getTime() + dias * DIA_MS));
    return hrefAgenda(base, { ...v, semana, mes: semana.slice(0, 7) });
  };
  const domingo = new Date(lunes.getTime() + 6 * DIA_MS);
  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href={mover(-7)} className="text-primario-700 underline" aria-label="Semana anterior">
        ←
      </Link>
      <span className="font-semibold text-slate-800">
        {formatDiaCorto(lunes)} – {formatDiaCorto(domingo)}
      </span>
      <Link href={mover(7)} className="text-primario-700 underline" aria-label="Semana siguiente">
        →
      </Link>
      <Link href={hrefAgenda(base, { ...v, semana: claveDia(hoy), mes: claveDia(hoy).slice(0, 7) })} className="text-slate-500 underline">
        Hoy
      </Link>
    </div>
  );
}

/** "← septiembre 2026 · octubre 2026 · noviembre 2026 →" dentro de la Agenda. */
export function NavegacionMesAgenda({ base, v }: { base: string; v: VistaAgenda }) {
  const ir = (mes: string) => hrefAgenda(base, { ...v, mes, semana: `${mes}-01` });
  const anterior = periodoAnterior(v.mes);
  const siguiente = periodoSiguiente(v.mes);
  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href={ir(anterior)} className="text-primario-700 underline" aria-label={nombreMes(anterior)}>
        ←
      </Link>
      <span className="font-semibold capitalize text-slate-800">{nombreMes(v.mes)}</span>
      <Link href={ir(siguiente)} className="text-primario-700 underline" aria-label={nombreMes(siguiente)}>
        →
      </Link>
    </div>
  );
}
