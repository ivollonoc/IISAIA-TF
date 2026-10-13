import { formatFechaHora } from "@/lib/format";
import { Tabla } from "@/components/ui";

const VIAS = { IN_APP: "App", EMAIL: "Mail", SMS: "SMS" } as const;

interface AvisoEnviado {
  id: string;
  asunto: string;
  mensaje: string;
  para: string;
  destinatarios: number;
  canales: ("IN_APP" | "EMAIL" | "SMS")[];
  createdAt: Date;
}

/** Avisos manuales enviados (no los individuales de cada usuario, que son privados). */
export function HistorialAvisos({ avisos, unidad }: { avisos: AvisoEnviado[]; unidad: [string, string] }) {
  if (avisos.length === 0) return <p className="text-sm text-slate-500">Todavía no se envió ningún aviso.</p>;
  const [singular, plural] = unidad;
  return (
    <Tabla headers={["Fecha", "Aviso", "Para", "Vías"]}>
      {avisos.map((a) => (
        <tr key={a.id} className="align-top">
          <td className="whitespace-nowrap py-2 pr-4 text-slate-500">{formatFechaHora(a.createdAt)}</td>
          <td className="py-2 pr-4">
            <span className="block font-medium">{a.asunto}</span>
            <span className="block whitespace-pre-line text-slate-600">{a.mensaje}</span>
          </td>
          <td className="py-2 pr-4">
            {a.para}
            <span className="block text-xs text-slate-500">
              {a.destinatarios} {a.destinatarios === 1 ? singular : plural}
            </span>
          </td>
          <td className="py-2 pr-4">{a.canales.map((c) => VIAS[c]).join(", ")}</td>
        </tr>
      ))}
    </Tabla>
  );
}
