"use server";

// Server Actions de avisos: bandeja (cualquier usuario), avisos manuales y canales.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { datos, ejecutar, rutaAdmin } from "@/lib/action";
import { requireClub, requireSuperadmin, requireUsuario } from "@/lib/session";
import { actualizarCanales } from "@/modules/clubs/service";
import { enviarAvisoClub, enviarAvisoPlataforma, marcarLeida, marcarTodasLeidas } from "./service";

/** Abre un aviso: lo marca leído y lleva a su link (o a la bandeja si no tiene). */
export async function abrirAvisoAction(id: string) {
  const user = await requireUsuario();
  const link = await marcarLeida(user.id, id);
  revalidatePath("/", "layout");
  redirect(link ?? "/avisos");
}

export async function marcarTodasLeidasAction() {
  const user = await requireUsuario();
  await marcarTodasLeidas(user.id);
  revalidatePath("/", "layout");
  redirect("/avisos");
}

export async function enviarAvisoClubAction(slug: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/avisos`, async () => {
    const { club } = await requireClub(slug, "admin");
    const { destinatarios } = await enviarAvisoClub(club.id, datos(formData));
    return `Aviso enviado a ${destinatarios} ${destinatarios === 1 ? "socio" : "socios"}`;
  });
}

export async function actualizarCanalesAction(slug: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/avisos`, async () => {
    const { club } = await requireClub(slug, "admin");
    await actualizarCanales(club.id, datos(formData));
    return "Vías de aviso actualizadas";
  });
}

export async function enviarAvisoPlataformaAction(formData: FormData) {
  await ejecutar("/admin/avisos", async () => {
    await requireSuperadmin();
    await enviarAvisoPlataforma(datos(formData));
    return "Aviso enviado";
  });
}
