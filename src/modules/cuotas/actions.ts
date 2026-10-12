"use server";

// Server Actions de cuotas (tipos de socio y pagos). Cada una re-verifica acceso con
// requireClub (los formularios no son una barrera de seguridad).
import { datos, ejecutar, rutaAdmin } from "@/lib/action";
import { requireClub } from "@/lib/session";
import { registrarPago } from "./pagos.service";
import { crearTipo } from "./tipos.service";

export async function crearTipoAction(slug: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/tipos`, async () => {
    const { club } = await requireClub(slug, "admin");
    await crearTipo(club.id, datos(formData));
  });
}

export async function registrarPagoAction(slug: string, socioId: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/socios/${socioId}`, async () => {
    const { club } = await requireClub(slug, "admin");
    await registrarPago(club.id, { ...datos(formData), socioId });
  });
}
