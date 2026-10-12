import { Boton, Campo, Selector } from "@/components/ui";

interface Props {
  action: (formData: FormData) => Promise<void>;
  tipos: { id: string; nombre: string }[];
  socio?: { nombre: string; apellido: string; dni: string; email: string | null; tipoSocioId: string };
}

/** Formulario reutilizado para alta y modificación de socios. */
export function SocioForm({ action, tipos, socio }: Props) {
  return (
    <form action={action} className="flex flex-col gap-3">
      <Campo label="Nombre" name="nombre" defaultValue={socio?.nombre} required />
      <Campo label="Apellido" name="apellido" defaultValue={socio?.apellido} required />
      <Campo label="DNI" name="dni" inputMode="numeric" defaultValue={socio?.dni} required />
      <Campo label="Email (para autogestión)" name="email" type="email" defaultValue={socio?.email ?? ""} />
      <Selector label="Tipo de socio" name="tipoSocioId" defaultValue={socio?.tipoSocioId ?? ""} required>
        <option value="" disabled>
          Elegir…
        </option>
        {tipos.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre}
          </option>
        ))}
      </Selector>
      <Boton type="submit">{socio ? "Guardar cambios" : "Dar de alta"}</Boton>
    </form>
  );
}
