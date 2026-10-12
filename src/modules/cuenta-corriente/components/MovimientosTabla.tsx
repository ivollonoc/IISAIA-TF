import { Tabla } from "@/components/ui";
import { formatFecha, formatPesos } from "@/lib/format";
import type { CuentaSocio } from "../consultas.service";
import { EstadoCargo } from "./EstadoCargo";

/**
 * Cuenta corriente de un socio con saldo acumulado. Con `seleccion`, cada cargo pendiente lleva
 * un checkbox con ese name; la página provee el <form> que envuelve la tabla.
 */
export function MovimientosTabla({
  movimientos,
  seleccion,
}: {
  movimientos: CuentaSocio["movimientos"];
  seleccion?: string;
}) {
  if (movimientos.length === 0) return <p className="text-sm text-slate-500">Sin movimientos.</p>;
  const headers = ["Fecha", "Concepto", "Cargo", "Pago", "Saldo", "Estado"];
  return (
    <Tabla headers={seleccion ? ["✓", ...headers] : headers}>
      {movimientos.map((m) => (
        <tr key={`${m.tipo}-${m.id}`} className={m.anulado ? "text-slate-400 line-through" : ""}>
          {seleccion && (
            <td className="py-2 pr-2">
              {m.tipo === "CARGO" && m.estado === "PENDIENTE" && (
                <input type="checkbox" name={seleccion} value={m.id} aria-label={`Seleccionar ${m.concepto}`} />
              )}
            </td>
          )}
          <td className="py-2 pr-4">{formatFecha(m.fecha)}</td>
          <td className="py-2 pr-4">{m.concepto}</td>
          <td className="py-2 pr-4">{m.tipo === "CARGO" ? formatPesos(m.monto) : ""}</td>
          <td className="py-2 pr-4">{m.tipo === "PAGO" ? formatPesos(m.monto) : ""}</td>
          <td className="py-2 pr-4 font-medium">{formatPesos(m.saldo)}</td>
          <td className="py-2 pr-4">{m.estado && <EstadoCargo estado={m.estado} vencido={m.vencido} />}</td>
        </tr>
      ))}
    </Tabla>
  );
}
