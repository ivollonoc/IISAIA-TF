"use server";

// Server Actions de actividades. Cada una re-verifica acceso con requireClub; en las del
// socio, el socioId sale de la sesión, nunca del formulario.
import { datos, ejecutar, rutaAdmin } from "@/lib/action";
import { formatPesos } from "@/lib/format";
import { requireClub } from "@/lib/session";
import { cancelarInscripcion, crearActividad, inscribir } from "./service";

export async function crearActividadAction(slug: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/actividades`, async () => {
    const { club } = await requireClub(slug, "admin");
    await crearActividad(club.id, datos(formData));
  });
}

export async function inscribirAction(slug: string, actividadId: string) {
  await ejecutar(`/c/${slug}/socio`, async () => {
    const { club, user } = await requireClub(slug, "socio");
    const r = await inscribir(club.id, actividadId, user.socioId!);
    return r.cargo
      ? `Inscripción confirmada. Se agregó el cargo de ${formatPesos(r.cargo.monto)} a tu cuenta`
      : "Inscripción confirmada";
  });
}

export async function cancelarAction(slug: string, actividadId: string) {
  await ejecutar(`/c/${slug}/socio`, async () => {
    const { club, user } = await requireClub(slug, "socio");
    await cancelarInscripcion(club.id, actividadId, user.socioId!);
    return "Inscripción cancelada";
  });
}
