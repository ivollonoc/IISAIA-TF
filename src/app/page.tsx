import Link from "next/link";
import { redirect } from "next/navigation";
import { getUsuario } from "@/lib/session";
import { homePath } from "@/lib/permisos";

// Landing pública; si hay sesión, deriva al área según el rol.
export default async function Home() {
  const user = await getUsuario();
  if (user) redirect(homePath(user));

  return (
    <div className="mx-auto max-w-2xl py-16 text-center">
      <h1 className="text-4xl font-bold text-slate-900">Gestión de socios para tu club</h1>
      <p className="mt-4 text-lg text-slate-600">
        Socios, cuotas y actividades en un solo lugar. Cada club con su espacio; cada socio con su autogestión.
      </p>
      <Link
        href="/login"
        className="mt-8 inline-block rounded-lg bg-emerald-700 px-6 py-3 font-medium text-white hover:bg-emerald-800"
      >
        Ingresar
      </Link>
    </div>
  );
}
