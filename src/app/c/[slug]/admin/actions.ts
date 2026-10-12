"use server";

// Server Actions del admin de club. Cada una re-verifica acceso con requireClub
// (los formularios no son una barrera de seguridad).
import { datos, ejecutar, rutaAdmin } from "@/lib/action";
import { requireClub } from "@/lib/session";
import { crearActividad } from "@/server/actividades";

export async function crearActividadAction(slug: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/actividades`, async () => {
    const { club } = await requireClub(slug, "admin");
    await crearActividad(club.id, datos(formData));
  });
}
