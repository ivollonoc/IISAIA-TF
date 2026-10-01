"use server";

import { ejecutar } from "@/lib/action";
import { requireSuperadmin } from "@/lib/session";
import { crearClub } from "@/server/clubs";

export async function crearClubAction(formData: FormData) {
  await ejecutar("/admin", async () => {
    await requireSuperadmin();
    await crearClub(Object.fromEntries(formData));
  });
}
