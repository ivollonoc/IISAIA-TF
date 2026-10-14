import Link from "next/link";
import { nombreMes } from "@/lib/format";
import { periodoAnterior, periodoSiguiente } from "@/lib/periodo";

/** "← septiembre 2026 · octubre 2026 · noviembre 2026 →" con links a `${base}?mes=…`. */
export function NavegacionMes({ periodo, base }: { periodo: string; base: string }) {
  const anterior = periodoAnterior(periodo);
  const siguiente = periodoSiguiente(periodo);
  return (
    <div className="mb-4 flex items-center justify-between text-sm">
      <Link href={`${base}?mes=${anterior}`} className="text-primario-700 underline">
        ← {nombreMes(anterior)}
      </Link>
      <span className="text-base font-semibold capitalize text-slate-800">{nombreMes(periodo)}</span>
      <Link href={`${base}?mes=${siguiente}`} className="text-primario-700 underline">
        {nombreMes(siguiente)} →
      </Link>
    </div>
  );
}
