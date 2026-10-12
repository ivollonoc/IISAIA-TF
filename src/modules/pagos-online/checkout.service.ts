// Checkout online: valida y cobra cargos pendientes del socio con la pasarela configurada.
import { db } from "@/lib/db";
import { DomainError, mensajeDeError } from "@/lib/errors";
import { registrarPago } from "@/modules/cuenta-corriente/pagos.service";
import { notificar } from "@/modules/notificaciones/emitir";
import { getPasarela } from "./index";
import type { Pasarela, ResultadoPasarela } from "./pasarela";
import { tarjetaSchema } from "./schema";

export type ResultadoCheckout =
  | { estado: "APROBADO"; intentoId: string; pagoId: string }
  | { estado: "RECHAZADO"; intentoId: string; motivo: string }
  | { estado: "PENDIENTE"; intentoId: string; redirectUrl?: string }
  | { estado: "REQUIERE_REVISION"; intentoId: string; motivo: string };

/** Cargos a pagar y su total. Falla si alguno no es del socio o ya no está pendiente. */
export async function prepararCheckout(clubId: string, socioId: string, cargoIds: string[]) {
  const ids = [...new Set(cargoIds.filter(Boolean))];
  if (ids.length === 0) throw new DomainError("Elegí al menos un cargo");
  const cargos = await db.cargo.findMany({
    where: { id: { in: ids }, clubId, socioId, estado: "PENDIENTE" },
    orderBy: { vencimiento: "asc" },
  });
  if (cargos.length !== ids.length) throw new DomainError("Alguno de los cargos ya fue pagado o anulado");
  return { cargos, total: cargos.reduce((s, c) => s + c.monto, 0) };
}

/**
 * Cobra los cargos con la pasarela. El monto se calcula acá (nunca se toma del formulario) y cada
 * intento queda registrado. Si la pasarela aprueba pero los cargos ya no están pendientes (p. ej.
 * se pagaron en ventanilla mientras tanto), el intento queda APROBADO sin pago, para revisión.
 */
export async function pagarOnline(
  clubId: string,
  socioId: string,
  cargoIds: string[],
  datosTarjeta: unknown,
  pasarela: Pasarela = getPasarela(),
): Promise<ResultadoCheckout> {
  const tarjeta = tarjetaSchema.parse(datosTarjeta);
  const { cargos, total } = await prepararCheckout(clubId, socioId, cargoIds);
  const ids = cargos.map((c) => c.id);
  const intento = await db.intentoPago.create({
    data: {
      clubId, socioId, cargoIds: ids, monto: total, estado: "PENDIENTE",
      pasarela: pasarela.nombre, ultimos4: tarjeta.numero.slice(-4),
    },
  });

  let resultado: ResultadoPasarela;
  try {
    resultado = await pasarela.cobrar(
      { intentoId: intento.id, monto: total, descripcion: cargos.map((c) => c.descripcion).join(", ") },
      tarjeta,
    );
  } catch (e) {
    console.error("Error de la pasarela", e);
    await db.intentoPago.update({
      where: { id: intento.id },
      data: { estado: "RECHAZADO", motivoRechazo: "Error de la pasarela" },
    });
    return { estado: "RECHAZADO", intentoId: intento.id, motivo: "Error de la pasarela" };
  }

  if (resultado.estado === "RECHAZADO") {
    await db.intentoPago.update({
      where: { id: intento.id },
      data: { estado: "RECHAZADO", motivoRechazo: resultado.motivo },
    });
    return { estado: "RECHAZADO", intentoId: intento.id, motivo: resultado.motivo };
  }

  if (resultado.estado === "PENDIENTE") {
    await db.intentoPago.update({ where: { id: intento.id }, data: { referenciaExterna: resultado.referencia } });
    return { estado: "PENDIENTE", intentoId: intento.id, redirectUrl: resultado.redirectUrl };
  }

  const referencia = resultado.referencia;
  try {
    const pago = await db.$transaction(async (tx) => {
      const p = await registrarPago(clubId, { socioId, cargoIds: ids, medio: "ONLINE" }, tx);
      await tx.intentoPago.update({
        where: { id: intento.id },
        data: { estado: "APROBADO", referenciaExterna: referencia, pagoId: p.id },
      });
      return p;
    });
    await notificar(clubId, { tipo: "PAGO_ACREDITADO", socioId, monto: pago.monto });
    return { estado: "APROBADO", intentoId: intento.id, pagoId: pago.id };
  } catch (e) {
    const motivo = mensajeDeError(e);
    if (motivo === null) console.error("Pago aprobado sin poder registrarse", e);
    await db.intentoPago.update({
      where: { id: intento.id },
      data: { estado: "APROBADO", referenciaExterna: referencia },
    });
    return { estado: "REQUIERE_REVISION", intentoId: intento.id, motivo: motivo ?? "Error al registrar el pago" };
  }
}
