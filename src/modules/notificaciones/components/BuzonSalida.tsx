import { Tabla } from "@/components/ui";

const fecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires",
});

interface Mensaje {
  id: string;
  canal: "IN_APP" | "EMAIL" | "SMS";
  destino: string;
  asunto: string | null;
  cuerpo: string;
  createdAt: Date;
  club: { nombre: string } | null;
}

/** Mails y SMS registrados en el buzón de salida (simulados o reales). */
export function BuzonSalida({ mensajes, conClub = false }: { mensajes: Mensaje[]; conClub?: boolean }) {
  if (mensajes.length === 0) return <p className="text-sm text-slate-500">Todavía no se envió ningún mail ni SMS.</p>;
  return (
    <Tabla headers={["Fecha", ...(conClub ? ["Club"] : []), "Vía", "Para", "Mensaje"]}>
      {mensajes.map((m) => (
        <tr key={m.id} className="align-top">
          <td className="py-2 pr-4 whitespace-nowrap text-slate-500">{fecha.format(m.createdAt)}</td>
          {conClub && <td className="py-2 pr-4">{m.club?.nombre ?? "—"}</td>}
          <td className="py-2 pr-4">{m.canal === "EMAIL" ? "Mail" : "SMS"}</td>
          <td className="py-2 pr-4">{m.destino}</td>
          <td className="py-2 pr-4">
            {m.asunto && <span className="block font-medium">{m.asunto}</span>}
            <span className="block whitespace-pre-line text-slate-600">{m.cuerpo}</span>
          </td>
        </tr>
      ))}
    </Tabla>
  );
}
