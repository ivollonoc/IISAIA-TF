import Link from "next/link";
import { getUsuario } from "@/lib/session";
import { abrirAvisoAction } from "@/modules/notificaciones/actions";
import { contarNoLeidas, ultimasNoLeidas } from "@/modules/notificaciones/service";

/** Franja bajo el header con el último aviso sin leer (y cuántos más hay). */
export async function BannerAvisos() {
  const user = await getUsuario();
  if (!user) return null;
  const [ultimo] = await ultimasNoLeidas(user.id, 1);
  if (!ultimo) return null;
  const resto = (await contarNoLeidas(user.id)) - 1;

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
        <span aria-hidden>🔔</span>
        <form action={abrirAvisoAction.bind(null, ultimo.id)} className="min-w-0 flex-1">
          <button className="max-w-full truncate text-left text-amber-900 hover:underline">
            <strong>{ultimo.titulo}</strong> · {ultimo.cuerpo}
          </button>
        </form>
        <Link href="/avisos" className="shrink-0 font-medium text-amber-900 underline">
          {resto > 0 ? `Ver todos (${resto + 1})` : "Ver avisos"}
        </Link>
      </div>
    </div>
  );
}
