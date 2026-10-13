import { redirect } from "next/navigation";
import { demoHabilitado } from "@/lib/auth";
import { getUsuario } from "@/lib/session";
import { homePath } from "@/lib/permisos";
import { Card } from "@/components/ui";
import { LoginHome } from "@/modules/acceso/components/LoginHome";

const ERRORES: Record<string, string> = {
  CredentialsSignin: "El link no es válido o ya venció. Pedí uno nuevo.",
};

// Landing pública con el login; si hay sesión, deriva al área según el rol.
export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getUsuario();
  if (user) redirect(homePath(user));
  const { error } = await searchParams;

  return (
    <div className="mx-auto grid max-w-5xl items-center gap-10 py-10 md:grid-cols-2">
      <div>
        <h1 className="text-4xl font-bold text-slate-900">Gestión de socios para tu club</h1>
        <p className="mt-4 text-lg text-slate-600">
          Socios, cuotas, actividades y avisos en un solo lugar. Cada club con su espacio; cada socio con su autogestión:
          reserva de clases, pagos online y su grupo familiar.
        </p>
      </div>
      <Card title="Ingresar">
        <LoginHome demo={demoHabilitado} error={error ? (ERRORES[error] ?? "No se pudo iniciar sesión.") : undefined} />
      </Card>
    </div>
  );
}
