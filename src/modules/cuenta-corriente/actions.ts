"use server";

// Server Actions de cuenta corriente (admin de club). Cada una re-verifica acceso con
// requireClub (los formularios no son una barrera de seguridad).
import { ejecutar, rutaAdmin } from "@/lib/action";
import { requireClub } from "@/lib/session";
import { registrarPago } from "./pagos.service";

/** Pago en ventanilla de los cargos tildados (checkboxes "cargoIds"). */
export async function registrarPagoAction(slug: string, socioId: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/socios/${socioId}`, async () => {
    const { club, user } = await requireClub(slug, "admin");
    await registrarPago(club.id, {
      socioId,
      cargoIds: formData.getAll("cargoIds").map(String),
      medio: formData.get("medio"),
      registradoPor: user.id,
    });
  });
}
