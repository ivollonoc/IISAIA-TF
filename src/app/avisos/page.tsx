import Link from "next/link";
import { requireUsuario } from "@/lib/session";
import { homePath } from "@/lib/permisos";
import { abrirAvisoAction, marcarTodasLeidasAction } from "@/modules/notificaciones/actions";
import { listarNotificaciones } from "@/modules/notificaciones/service";
import { Boton, Card, Titulo } from "@/components/ui";

const fecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires",
});

/** Bandeja de avisos del usuario logueado (cualquier rol). */
export default async function AvisosPage() {
  const user = await requireUsuario();
  const avisos = await listarNotificaciones(user.id);
  const hayNoLeidas = avisos.some((a) => !a.leidaAt);

  return (
    <>
      <Link href={homePath(user)} className="mb-2 inline-block text-sm text-primario-700 underline">
        ← Volver
      </Link>
      <Titulo sub="Novedades de tu club y de tu cuenta">Avisos</Titulo>
      <Card>
        {avisos.length === 0 ? (
          <p className="text-sm text-slate-500">No tenés avisos todavía.</p>
        ) : (
          <>
            {hayNoLeidas && (
              <form action={marcarTodasLeidasAction} className="mb-3 text-right">
                <Boton variante="secundario">Marcar todos como leídos</Boton>
              </form>
            )}
            <ul className="divide-y divide-slate-100">
              {avisos.map((a) => (
                <li key={a.id}>
                  <form action={abrirAvisoAction.bind(null, a.id)}>
                    <button className={`flex w-full gap-3 py-3 text-left hover:bg-slate-50 ${a.leidaAt ? "opacity-70" : ""}`}>
                      <span
                        aria-label={a.leidaAt ? "Leído" : "Sin leer"}
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.leidaAt ? "bg-transparent" : "bg-primario-600"}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${a.leidaAt ? "text-slate-700" : "font-semibold text-slate-900"}`}>{a.titulo}</span>
                        <span className="block text-sm text-slate-600">{a.cuerpo}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{fecha.format(a.createdAt)}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
