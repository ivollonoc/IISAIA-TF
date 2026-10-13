"use server";

// Server Actions de socios (admin de club). Cada una re-verifica acceso con requireClub
// (los formularios no son una barrera de seguridad).
import { revalidatePath } from "next/cache";
import { datos, ejecutar, rutaAdmin } from "@/lib/action";
import { mensajeDeError } from "@/lib/errors";
import { requireClub } from "@/lib/session";
import { agregarAlGrupo, quitarDelGrupo } from "./grupos.service";
import { importarSocios, previsualizarImportacion } from "./importar";
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

export interface EstadoImportacion {
  texto?: string;
  filas?: { linea: number; valores: Record<string, string>; errores: string[] }[];
  validas?: number;
  error?: string;
  ok?: string;
}

/** Paso 1 (modo "previsualizar", con el archivo) y paso 2 (modo "importar", con el texto ya leído). */
export async function importarSociosAction(slug: string, _previo: EstadoImportacion, formData: FormData): Promise<EstadoImportacion> {
  const { club } = await requireClub(slug, "admin");
  const archivo = formData.get("archivo");
  const texto = archivo instanceof File && archivo.size > 0 ? await archivo.text() : String(formData.get("texto") ?? "");
  try {
    if (formData.get("modo") === "importar") {
      const r = await importarSocios(club.id, texto, { invitar: formData.get("invitar") === "on" });
      revalidatePath(`${rutaAdmin(slug)}/socios`);
      return { ok: `Se importaron ${r.creados} socios${r.invitados ? ` y se invitó a ${r.invitados} por mail` : ""}` };
    }
    const r = await previsualizarImportacion(club.id, texto);
    return { texto, filas: r.filas.map(({ linea, valores, errores }) => ({ linea, valores, errores })), validas: r.validas };
  } catch (e) {
    const msg = mensajeDeError(e);
    if (msg === null) throw e;
    return { error: msg };
  }
}
