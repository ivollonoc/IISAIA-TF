"use server";

// Server Actions de la Agenda del admin de club (clases y eventos). Cada una re-verifica acceso
// con requireClub y vuelve a la vista que se estaba mirando (`volver`, saneado en rutaAgenda).
import { datos, ejecutar } from "@/lib/action";
import { requireClub } from "@/lib/session";
import { crearEvento, eliminarEvento } from "./eventos.service";
import { reprogramarClase, restablecerClase, suspenderClase } from "./service";
import { rutaAgenda } from "./vista";

export async function suspenderClaseAction(slug: string, volver: string, actividadId: string, fecha: string, formData: FormData) {
  await ejecutar(rutaAgenda(slug, volver), async () => {
    const { club } = await requireClub(slug, "admin");
    await suspenderClase(club.id, { ...datos(formData), actividadId, fecha });
    return "Clase suspendida";
  }, rutaAgenda(slug, volver, { clase: `${actividadId}:${fecha}` }));
}

export async function reprogramarClaseAction(slug: string, volver: string, actividadId: string, fecha: string, formData: FormData) {
  await ejecutar(rutaAgenda(slug, volver), async () => {
    const { club } = await requireClub(slug, "admin");
    await reprogramarClase(club.id, { ...datos(formData), actividadId, fecha });
    return "Clase reprogramada";
  }, rutaAgenda(slug, volver, { clase: `${actividadId}:${fecha}` }));
}

export async function restablecerClaseAction(slug: string, volver: string, excepcionId: string) {
  await ejecutar(rutaAgenda(slug, volver), async () => {
    const { club } = await requireClub(slug, "admin");
    await restablecerClase(club.id, excepcionId);
    return "Clase restablecida";
  });
}

export async function crearEventoAction(slug: string, volver: string, formData: FormData) {
  await ejecutar(rutaAgenda(slug, volver), async () => {
    const { club } = await requireClub(slug, "admin");
    await crearEvento(club.id, datos(formData));
    return "Evento creado";
  }, rutaAgenda(slug, volver, { nuevo: "evento" }));
}

export async function eliminarEventoAction(slug: string, volver: string, eventoId: string) {
  await ejecutar(rutaAgenda(slug, volver), async () => {
    const { club } = await requireClub(slug, "admin");
    await eliminarEvento(club.id, eventoId);
    return "Evento eliminado";
  });
}
