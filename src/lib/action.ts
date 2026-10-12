import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { queryAviso } from "./aviso";
import { mensajeDeError } from "./errors";

/**
 * Envuelve un Server Action: ejecuta, revalida y vuelve a `ruta` con ?ok=<mensaje> (o ?ok=1 si la
 * acción no devuelve un texto) o ?error=<mensaje>, firmados (ver aviso.ts). Errores inesperados
 * (y los redirect de los guards) se relanzan. Con `rutaError`, los errores vuelven ahí (p. ej. para
 * mantener abierta la selección del formulario que falló).
 */
export async function ejecutar(ruta: string, fn: () => Promise<unknown>, rutaError: string = ruta): Promise<never> {
  let error: string | null = null;
  let ok = "1";
  try {
    const r = await fn();
    if (typeof r === "string") ok = r;
  } catch (e) {
    error = mensajeDeError(e);
    if (error === null) throw e;
  }
  revalidatePath(ruta.split("?")[0]);
  const destino = error ? rutaError : ruta;
  const separador = destino.includes("?") ? "&" : "?";
  redirect(`${destino}${separador}${error ? queryAviso("error", error) : queryAviso("ok", ok)}`);
}

/** Ruta base del área de administración de un club. */
export const rutaAdmin = (slug: string) => `/c/${slug}/admin`;

/** Campos de un formulario como objeto plano, para validar con Zod en el servicio. */
export const datos = (formData: FormData) => Object.fromEntries(formData);
