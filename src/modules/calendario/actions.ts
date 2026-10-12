"use server";

// Server Actions del calendario (admin de club). Cada una re-verifica acceso con requireClub
// y vuelve al mes que se estaba viendo, sin selección.
import { datos, ejecutar, rutaAdmin } from "@/lib/action";
import { requireClub } from "@/lib/session";
import { crearEvento, eliminarEvento, reprogramarClase, restablecerClase, suspenderClase } from "./service";

const rutaCalendario = (slug: string, mes: string) => `${rutaAdmin(slug)}/calendario?mes=${mes}`;

export async function suspenderClaseAction(slug: string, mes: string, actividadId: string, fecha: string, formData: FormData) {
  await ejecutar(rutaCalendario(slug, mes), async () => {
    const { club } = await requireClub(slug, "admin");
    await suspenderClase(club.id, { ...datos(formData), actividadId, fecha });
    return "Clase suspendida";
  });
}

export async function reprogramarClaseAction(slug: string, mes: string, actividadId: string, fecha: string, formData: FormData) {
  await ejecutar(rutaCalendario(slug, mes), async () => {
    const { club } = await requireClub(slug, "admin");
    await reprogramarClase(club.id, { ...datos(formData), actividadId, fecha });
    return "Clase reprogramada";
  });
}

export async function restablecerClaseAction(slug: string, mes: string, excepcionId: string) {
  await ejecutar(rutaCalendario(slug, mes), async () => {
    const { club } = await requireClub(slug, "admin");
    await restablecerClase(club.id, excepcionId);
    return "Clase restablecida";
  });
}

export async function crearEventoAction(slug: string, mes: string, formData: FormData) {
  await ejecutar(rutaCalendario(slug, mes), async () => {
    const { club } = await requireClub(slug, "admin");
    await crearEvento(club.id, datos(formData));
    return "Evento creado";
  });
}

export async function eliminarEventoAction(slug: string, mes: string, eventoId: string) {
  await ejecutar(rutaCalendario(slug, mes), async () => {
    const { club } = await requireClub(slug, "admin");
    await eliminarEvento(club.id, eventoId);
    return "Evento eliminado";
  });
}
