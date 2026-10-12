"use server";

import { datos, ejecutar, rutaAdmin } from "@/lib/action";
import { requireClub, requireSuperadmin } from "@/lib/session";
import { actualizarConfigClub, crearClub } from "./service";

export async function crearClubAction(formData: FormData) {
  await ejecutar("/admin", async () => {
    await requireSuperadmin();
    await crearClub(Object.fromEntries(formData));
  });
}

export async function actualizarConfigClubAction(slug: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/tipos`, async () => {
    const { club } = await requireClub(slug, "admin");
    await actualizarConfigClub(club.id, datos(formData));
    return "Día de vencimiento actualizado";
  });
}
