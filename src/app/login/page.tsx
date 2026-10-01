import { redirect } from "next/navigation";
import { demoHabilitado, googleHabilitado } from "@/lib/auth";
import { getUsuario } from "@/lib/session";
import { homePath } from "@/lib/permisos";
import { Card } from "@/components/ui";
import { LoginForm } from "./LoginForm";

const ERRORES: Record<string, string> = {
  AccessDenied: "Tu email no está registrado en ningún club.",
  CredentialsSignin: "Email no registrado.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getUsuario();
  if (user) redirect(homePath(user));

  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <Card title="Ingresar">
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            {ERRORES[error] ?? "No se pudo iniciar sesión."}
          </p>
        )}
        <LoginForm google={googleHabilitado} demo={demoHabilitado} />
      </Card>
    </div>
  );
}
