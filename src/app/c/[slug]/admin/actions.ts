"use server";

// Server Actions del admin de club. Cada una re-verifica acceso con requireClub
// (los formularios no son una barrera de seguridad).
import { datos, ejecutar, rutaAdmin } from "@/lib/action";
import { requireClub } from "@/lib/session";
import { actualizarSocio, cambiarEstadoSocio, crearSocio } from "@/server/socios";
import { crearActividad } from "@/server/actividades";

export async function crearSocioAction(slug: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/socios`, async () => {
    const { club } = await requireClub(slug, "admin");
    await crearSocio(club.id, datos(formData));
  });
}

export async function actualizarSocioAction(slug: string, socioId: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/socios/${socioId}`, async () => {
    const { club } = await requireClub(slug, "admin");
    await actualizarSocio(club.id, socioId, datos(formData));
  });
}

export async function cambiarEstadoSocioAction(slug: string, socioId: string, activo: boolean) {
  await ejecutar(`${rutaAdmin(slug)}/socios/${socioId}`, async () => {
    const { club } = await requireClub(slug, "admin");
    await cambiarEstadoSocio(club.id, socioId, activo);
  });
}

export async function crearActividadAction(slug: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/actividades`, async () => {
    const { club } = await requireClub(slug, "admin");
    await crearActividad(club.id, datos(formData));
  });
}
