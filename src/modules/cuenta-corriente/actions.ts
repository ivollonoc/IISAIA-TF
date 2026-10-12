"use server";

// Server Actions de cuenta corriente (admin de club). Cada una re-verifica acceso con
// requireClub (los formularios no son una barrera de seguridad).
import { datos, ejecutar, rutaAdmin } from "@/lib/action";
import { requireClub } from "@/lib/session";
import { anularCargo, generarCargosPeriodo } from "./cargos.service";
import { registrarPago } from "./pagos.service";
import { medioVentanillaSchema } from "./schema";

/** Pago en ventanilla de los cargos tildados (checkboxes "cargoIds"). */
export async function registrarPagoAction(slug: string, socioId: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/socios/${socioId}`, async () => {
    const { club, user } = await requireClub(slug, "admin");
    await registrarPago(club.id, {
      socioId,
      cargoIds: formData.getAll("cargoIds").map(String),
      medio: medioVentanillaSchema.parse(formData.get("medio")),
      registradoPor: user.id,
    });
    return "Pago registrado";
  });
}

export async function generarCargosAction(slug: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/cuenta`, async () => {
    const { club } = await requireClub(slug, "admin");
    const r = await generarCargosPeriodo(club.id, datos(formData));
    return `Se generaron ${r.creados} cargos (${r.existentes} ya existían)`;
  });
}

export async function anularCargoAction(slug: string, socioId: string, cargoId: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/socios/${socioId}`, async () => {
    const { club } = await requireClub(slug, "admin");
    await anularCargo(club.id, cargoId, datos(formData));
    return "Cargo anulado";
  });
}
