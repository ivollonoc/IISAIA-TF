import { Card, Stat, Tabla } from "@/components/ui";
import { formatFecha, formatPesos } from "@/lib/format";
import type { CuentaClubData } from "../consultas.service";

/** Cuenta del club (solo presentación): la usan el admin del club y, en lectura, el admin general. */
export function CuentaClub({ cuenta }: { cuenta: CuentaClubData }) {
  return (
    <>
      {cuenta.intentosSinPago > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Intentos aprobados sin pago vinculado ({cuenta.intentosSinPago}): requieren revisión.
        </p>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label={`Cobrado ${cuenta.periodo}`} valor={formatPesos(cuenta.cobrado)} />
        <Stat label="Cobrado online" valor={formatPesos(cuenta.cobradoOnline)} />
        <Stat label="Cobrado en ventanilla" valor={formatPesos(cuenta.cobradoVentanilla)} />
        <Stat label="Deuda pendiente" valor={formatPesos(cuenta.deudaPendiente)} />
        <Stat label="Deuda vencida" valor={formatPesos(cuenta.deudaVencida)} />
      </div>
      <Card title="Acreditaciones del mes">
        {cuenta.acreditaciones.length === 0 ? (
          <p className="text-sm text-slate-500">Sin cobros este mes.</p>
        ) : (
          <Tabla headers={["Fecha", "Socio", "Medio", "Monto"]}>
            {cuenta.acreditaciones.map((p) => (
              <tr key={p.id}>
                <td className="py-2 pr-4">{formatFecha(p.fecha)}</td>
                <td className="py-2 pr-4">
                  N° {p.socio.nroSocio} · {p.socio.apellido}, {p.socio.nombre}
                </td>
                <td className="py-2 pr-4">{p.medio.toLowerCase()}</td>
                <td className="py-2 pr-4">{formatPesos(p.monto)}</td>
              </tr>
            ))}
          </Tabla>
        )}
      </Card>
    </>
  );
}
