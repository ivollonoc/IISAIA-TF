import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mensajeDeError } from "./errors";

/**
 * Envuelve un Server Action: ejecuta, revalida y vuelve a `ruta` con
 * ?ok=1 o ?error=<mensaje>. Errores inesperados (y los redirect de los
 * guards) se relanzan.
 */
export async function ejecutar(ruta: string, fn: () => Promise<unknown>): Promise<never> {
  let error: string | null = null;
  try {
    await fn();
  } catch (e) {
    error = mensajeDeError(e);
    if (error === null) throw e;
  }
  revalidatePath(ruta);
  redirect(error ? `${ruta}?error=${encodeURIComponent(error)}` : `${ruta}?ok=1`);
}
