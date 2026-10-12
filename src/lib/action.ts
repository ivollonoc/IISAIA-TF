import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mensajeDeError } from "./errors";

/**
 * Envuelve un Server Action: ejecuta, revalida y vuelve a `ruta` con ?ok=<mensaje> (o ?ok=1 si la
 * acción no devuelve un texto) o ?error=<mensaje>. Errores inesperados (y los redirect de los
 * guards) se relanzan.
 */
export async function ejecutar(ruta: string, fn: () => Promise<unknown>): Promise<never> {
  let error: string | null = null;
  let ok = "1";
  try {
    const r = await fn();
    if (typeof r === "string") ok = r;
  } catch (e) {
    error = mensajeDeError(e);
    if (error === null) throw e;
  }
  revalidatePath(ruta);
  redirect(error ? `${ruta}?error=${encodeURIComponent(error)}` : `${ruta}?ok=${encodeURIComponent(ok)}`);
}

/** Ruta base del área de administración de un club. */
export const rutaAdmin = (slug: string) => `/c/${slug}/admin`;

/** Campos de un formulario como objeto plano, para validar con Zod en el servicio. */
export const datos = (formData: FormData) => Object.fromEntries(formData);
