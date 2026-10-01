import Link from "next/link";
import { getUsuario } from "@/lib/session";
import { LogoutButton } from "./LogoutButton";

const ROL_LABEL = { SUPERADMIN: "Admin general", ADMIN_CLUB: "Admin de club", SOCIO: "Socio" } as const;

export async function Header() {
  const user = await getUsuario();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-bold text-emerald-800">
          gestiondesocios
        </Link>
        {user && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">
              {user.email} · {ROL_LABEL[user.rol]}
            </span>
            <LogoutButton />
          </div>
        )}
      </div>
    </header>
  );
}
