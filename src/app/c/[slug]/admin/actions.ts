"use server";

// Server Actions del admin de club. Cada una re-verifica acceso con requireClub
// (los formularios no son una barrera de seguridad).
import { ejecutar } from "@/lib/action";
import { requireClub } from "@/lib/session";
import { crearTipo } from "@/server/tipos";
import { actualizarSocio, cambiarEstadoSocio, crearSocio } from "@/server/socios";
import { registrarPago } from "@/server/pagos";
import { crearActividad } from "@/server/actividades";

const base = (slug: string) => `/c/${slug}/admin`;
const datos = (f: FormData) => Object.fromEntries(f);

export async function crearTipoAction(slug: string, formData: FormData) {
  await ejecutar(`${base(slug)}/tipos`, async () => {
    const { club } = await requireClub(slug, "admin");
    await crearTipo(club.id, datos(formData));
  });
}

export async function crearSocioAction(slug: string, formData: FormData) {
  await ejecutar(`${base(slug)}/socios`, async () => {
    const { club } = await requireClub(slug, "admin");
    await crearSocio(club.id, datos(formData));
  });
}

export async function actualizarSocioAction(slug: string, socioId: string, formData: FormData) {
  await ejecutar(`${base(slug)}/socios/${socioId}`, async () => {
    const { club } = await requireClub(slug, "admin");
    await actualizarSocio(club.id, socioId, datos(formData));
  });
}

export async function cambiarEstadoSocioAction(slug: string, socioId: string, activo: boolean) {
  await ejecutar(`${base(slug)}/socios/${socioId}`, async () => {
    const { club } = await requireClub(slug, "admin");
    await cambiarEstadoSocio(club.id, socioId, activo);
  });
}

export async function registrarPagoAction(slug: string, socioId: string, formData: FormData) {
  await ejecutar(`${base(slug)}/socios/${socioId}`, async () => {
    const { club } = await requireClub(slug, "admin");
    await registrarPago(club.id, { ...datos(formData), socioId });
  });
}

export async function crearActividadAction(slug: string, formData: FormData) {
  await ejecutar(`${base(slug)}/actividades`, async () => {
    const { club } = await requireClub(slug, "admin");
    await crearActividad(club.id, datos(formData));
  });
}
