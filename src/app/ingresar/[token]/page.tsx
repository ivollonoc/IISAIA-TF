import { redirect } from "next/navigation";
import { getUsuario } from "@/lib/session";
import { homePath } from "@/lib/permisos";
import { Card } from "@/components/ui";
import { BotonIngresar } from "@/modules/acceso/components/BotonIngresar";

// Destino del link mágico o de la invitación. El token se consume recién al tocar "Ingresar"
// (los clientes de correo que abren los links para previsualizarlos no lo gastan).
export default async function IngresarPage({ params }: { params: Promise<{ token: string }> }) {
  const user = await getUsuario();
  if (user) redirect(homePath(user));
  const { token } = await params;
  return (
    <div className="mx-auto max-w-md py-10">
      <Card title="Ingresar a Gestión de Socios">
        <p className="mb-4 text-sm text-slate-600">Este link vale una sola vez.</p>
        <BotonIngresar token={token} />
      </Card>
    </div>
  );
}
