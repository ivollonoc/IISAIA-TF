import { leerAviso } from "@/lib/aviso";
import { requireClub } from "@/lib/session";
import { listarActividades } from "@/modules/actividades/service";
import { actualizarCanalesAction, enviarAvisoClubAction } from "@/modules/notificaciones/actions";
import { proveedorEmail } from "@/modules/notificaciones/canales";
import { historialAvisos } from "@/modules/notificaciones/service";
import { HistorialAvisos } from "@/modules/notificaciones/components/HistorialAvisos";
import { Aviso, Boton, Campo, Card, Selector, Titulo, type SearchParams } from "@/components/ui";

export default async function AvisosClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const [actividades, historial, msg] = await Promise.all([listarActividades(club.id), historialAvisos("CLUB", club.id), searchParams]);
  const simulado = proveedorEmail() === "simulado";

  return (
    <>
      <Titulo sub="Comunicación con los socios: avisos manuales y vías de aviso">Avisos</Titulo>
      <Aviso {...leerAviso(msg)} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Enviar un aviso">
            <form action={enviarAvisoClubAction.bind(null, slug)} className="flex flex-col gap-3">
              <Campo label="Asunto" name="asunto" placeholder="Corte de agua el sábado" required />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Mensaje</span>
                <textarea name="mensaje" rows={4} required className="rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <Selector label="Para" name="actividadId" defaultValue="">
                <option value="">Todos los socios</option>
                {actividades
                  .filter((a) => a.activa)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      Participantes de {a.nombre}
                    </option>
                  ))}
              </Selector>
              <Boton type="submit">Enviar</Boton>
            </form>
          </Card>
          <Card title="Avisos enviados">
            <HistorialAvisos avisos={historial} unidad={["socio", "socios"]} />
          </Card>
        </div>
        <Card title="Vías de aviso">
          <form action={actualizarCanalesAction.bind(null, slug)} className="flex flex-col gap-3 text-sm">
            <label className="flex items-center gap-2 text-slate-500">
              <input type="checkbox" checked disabled className="accent-emerald-700" />
              Notificación en la app (siempre)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="EMAIL" defaultChecked={club.canales.includes("EMAIL")} className="accent-emerald-700" />
              Mail (a los socios con email)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="SMS" defaultChecked={club.canales.includes("SMS")} className="accent-emerald-700" />
              SMS (a los socios con teléfono)
            </label>
            {simulado && <p className="text-xs text-slate-500">En esta demo los mails y SMS son simulados: no salen de la app.</p>}
            <Boton type="submit">Guardar</Boton>
          </form>
        </Card>
      </div>
    </>
  );
}
