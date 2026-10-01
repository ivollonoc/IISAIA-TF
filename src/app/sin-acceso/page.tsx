import { Card } from "@/components/ui";
import { LogoutButton } from "@/components/LogoutButton";

// Destino de los guards cuando el usuario no tiene permiso (evita loops de redirección).
export default function SinAccesoPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card title="Sin acceso">
        <p className="mb-4 text-sm text-slate-600">
          Tu usuario no tiene permiso para ver esta sección o todavía no está vinculado a un club o ficha de socio.
          Pedile al administrador de tu club que revise tu alta.
        </p>
        <LogoutButton />
      </Card>
    </div>
  );
}
