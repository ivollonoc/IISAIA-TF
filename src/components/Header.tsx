import Link from "next/link";
import { getUsuario } from "@/lib/session";
import { clubDelPedido } from "@/modules/clubs/visual";
import { contarNoLeidas } from "@/modules/notificaciones/service";
import { LogoutButton } from "./LogoutButton";

const ROL_LABEL = { SUPERADMIN: "Admin general", ADMIN_CLUB: "Admin de club", SOCIO: "Socio" } as const;

export async function Header() {
  const user = await getUsuario();
  const noLeidas = user ? await contarNoLeidas(user.id) : 0;
  const club = await clubDelPedido();
  return (
    <header className="border-b-4 border-secundario bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-primario-800">
          {club?.logoUrl && <img src={club.logoUrl} alt="" className="h-8 w-8 object-contain" />}
          {club ? club.nombre : "gestiondesocios"}
        </Link>
        {user && (
          <div className="flex items-center gap-4">
            <Link
              href="/avisos"
              className="relative text-lg leading-none"
              aria-label={noLeidas ? `Avisos: ${noLeidas} sin leer` : "Avisos"}
              title="Avisos"
            >
              <span aria-hidden>🔔</span>
              {noLeidas > 0 && (
                <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-4 text-white">
                  {noLeidas > 9 ? "9+" : noLeidas}
                </span>
              )}
            </Link>
            <span className="hidden text-sm text-slate-500 sm:inline">
              {user.email} · {ROL_LABEL[user.rol]}
            </span>
            <LogoutButton />
          </div>
        )}
      </div>
    </header>
  );
}
