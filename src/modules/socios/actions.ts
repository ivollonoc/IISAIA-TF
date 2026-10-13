"use server";

// Server Actions de socios (admin de club). Cada una re-verifica acceso con requireClub
// (los formularios no son una barrera de seguridad).
import { datos, ejecutar, rutaAdmin } from "@/lib/action";
import { requireClub } from "@/lib/session";
import { agregarAlGrupo, quitarDelGrupo } from "./grupos.service";
import { actualizarSocio, cambiarEstadoSocio, crearSocio } from "./service";

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

export async function agregarAlGrupoAction(slug: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/grupos`, async () => {
    const { club } = await requireClub(slug, "admin");
    await agregarAlGrupo(club.id, datos(formData));
    return "Socio agregado al grupo familiar";
  });
}

export async function quitarDelGrupoAction(slug: string, socioId: string) {
  await ejecutar(`${rutaAdmin(slug)}/grupos`, async () => {
    const { club } = await requireClub(slug, "admin");
    await quitarDelGrupo(club.id, socioId);
    return "Socio quitado del grupo familiar";
  });
}
