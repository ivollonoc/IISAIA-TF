"use server";

// El socio solo puede operar sobre sí mismo: el socioId sale de la sesión, nunca del formulario.
import { ejecutar } from "@/lib/action";
import { requireClub } from "@/lib/session";
import { cancelarInscripcion, inscribir } from "@/server/actividades";

export async function inscribirAction(slug: string, actividadId: string) {
  await ejecutar(`/c/${slug}/socio`, async () => {
    const { club, user } = await requireClub(slug, "socio");
    await inscribir(club.id, actividadId, user.socioId!);
  });
}

export async function cancelarAction(slug: string, actividadId: string) {
  await ejecutar(`/c/${slug}/socio`, async () => {
    const { club, user } = await requireClub(slug, "socio");
    await cancelarInscripcion(club.id, actividadId, user.socioId!);
  });
}
