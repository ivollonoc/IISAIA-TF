"use server";

// Checkout del socio. El socioId sale de la sesión, nunca del formulario.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { datos } from "@/lib/action";
import { queryAviso } from "@/lib/aviso";
import { mensajeDeError } from "@/lib/errors";
import { requireClub } from "@/lib/session";
import { pagarOnline } from "./checkout.service";

export async function pagarAction(slug: string, cargoIds: string[], formData: FormData) {
  const { club, user } = await requireClub(slug, "socio");
  const enc = encodeURIComponent;
  const cuenta = `/c/${slug}/socio`;
  const checkout = `${cuenta}/pagar?${cargoIds.map((id) => `cargos=${enc(id)}`).join("&")}`;

  let destino: string;
  try {
    const r = await pagarOnline(club.id, user.socioId!, cargoIds, datos(formData));
    if (r.estado === "APROBADO") destino = `${cuenta}?${queryAviso("ok", "Pago aprobado")}`;
    else if (r.estado === "RECHAZADO") destino = `${checkout}&${queryAviso("error", `Pago rechazado: ${r.motivo}`)}`;
    else if (r.estado === "PENDIENTE") destino = r.redirectUrl ?? `${cuenta}?${queryAviso("ok", "Pago en proceso")}`;
    else {
      const aviso = `El pago fue aprobado pero no se pudo imputar (${r.motivo}). El club lo va a revisar.`;
      destino = `${cuenta}?${queryAviso("error", aviso)}`;
    }
  } catch (e) {
    const msg = mensajeDeError(e);
    if (msg === null) throw e;
    destino = `${checkout}&${queryAviso("error", msg)}`;
  }
  revalidatePath(cuenta);
  redirect(destino);
}
