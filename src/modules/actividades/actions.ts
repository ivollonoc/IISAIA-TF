"use server";

// Server Actions de actividades del admin de club (las del socio están en calendario/socio.actions).
// Cada una re-verifica acceso con requireClub.
import { datos, ejecutar } from "@/lib/action";
import { requireClub } from "@/lib/session";
import { rutaAgenda } from "@/modules/calendario/vista";
import { cambiarEstadoActividad, crearActividad, editarActividad } from "./service";

export async function crearActividadAction(slug: string, volver: string, formData: FormData) {
  await ejecutar(rutaAgenda(slug, volver), async () => {
    const { club } = await requireClub(slug, "admin");
    await crearActividad(club.id, datos(formData));
    return "Actividad creada";
  }, rutaAgenda(slug, volver, { nuevo: "actividad" }));
}

export async function editarActividadAction(slug: string, volver: string, actividadId: string, formData: FormData) {
  const conActividad = rutaAgenda(slug, volver, { actividad: actividadId });
  await ejecutar(conActividad, async () => {
    const { club } = await requireClub(slug, "admin");
    const { excepcionesBorradas: n } = await editarActividad(club.id, actividadId, datos(formData));
    return n > 0
      ? `Actividad actualizada. Se quitaron ${n} ${n === 1 ? "cambio de clase que ya no corresponde" : "cambios de clases que ya no corresponden"}`
      : "Actividad actualizada";
  });
}

export async function cambiarEstadoActividadAction(slug: string, volver: string, actividadId: string, activa: boolean) {
  await ejecutar(rutaAgenda(slug, volver, { actividad: actividadId }), async () => {
    const { club } = await requireClub(slug, "admin");
    await cambiarEstadoActividad(club.id, actividadId, activa);
    return activa ? "Actividad reactivada" : "Actividad desactivada";
  });
}
