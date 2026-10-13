// Pagos: la única vía para cancelar cargos (la usan el pago manual del admin y el checkout online).
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { notificar } from "@/modules/notificaciones/emitir";
import { registrarPagoSchema } from "./schema";

/**
 * Registra un pago que cancela cargos completos del socio. Si alguno ya no está pendiente
 * (pagado en otra ventanilla, doble click, anulado) aborta todo: el chequeo de cantidad del
 * updateMany es lo que impide el doble pago. Con `tx` corre dentro de esa transacción.
 */
export async function registrarPago(clubId: string, input: unknown, tx?: Prisma.TransactionClient) {
  const data = registrarPagoSchema.parse(input);

  const registrar = async (t: Prisma.TransactionClient) => {
    const cargos = await t.cargo.findMany({
      where: { id: { in: data.cargoIds }, clubId, socioId: data.socioId },
      select: { monto: true },
    });
    if (cargos.length !== data.cargoIds.length) throw new DomainError("Cargo no encontrado");

    const pago = await t.pago.create({
      data: {
        clubId,
        socioId: data.socioId,
        monto: cargos.reduce((s, c) => s + c.monto, 0),
        medio: data.medio,
        registradoPor: data.registradoPor ?? null,
      },
    });
    const { count } = await t.cargo.updateMany({
      where: { id: { in: data.cargoIds }, clubId, socioId: data.socioId, estado: "PENDIENTE" },
      data: { estado: "PAGADO", pagoId: pago.id },
    });
    if (count !== data.cargoIds.length) throw new DomainError("Alguno de los cargos ya fue pagado o anulado");
    return pago;
  };

  // Dentro de una transacción ajena, avisa quien la abrió (después de confirmarla).
  if (tx) return registrar(tx);
  const pago = await db.$transaction(registrar);
  await notificar(clubId, { tipo: "PAGO_ACREDITADO", socioId: pago.socioId, monto: pago.monto });
  return pago;
}

/**
 * Pago online de un socio que puede incluir cargos de su grupo familiar (si es titular): crea un
 * pago por cada socio dueño de cargos, así la cuenta de cada uno cierra; los de los familiares
 * llevan `pagadorId` = titular. Corre dentro de la transacción del checkout; `socioIds` son los
 * socios cuyos cargos puede pagar (ver integrantesDelGrupo).
 */
export async function registrarPagoGrupal(
  tx: Prisma.TransactionClient,
  clubId: string,
  pago: { pagadorId: string; socioIds: string[]; cargoIds: string[]; medio: "ONLINE"; intentoId: string },
) {
  const cargos = await tx.cargo.findMany({
    where: { id: { in: pago.cargoIds }, clubId, socioId: { in: pago.socioIds } },
    select: { id: true, socioId: true, monto: true },
  });
  if (cargos.length !== pago.cargoIds.length) throw new DomainError("Cargo no encontrado");

  const porSocio = new Map<string, typeof cargos>();
  for (const c of cargos) porSocio.set(c.socioId, [...(porSocio.get(c.socioId) ?? []), c]);
  const pagos = [];
  for (const [socioId, deSocio] of porSocio) {
    const p = await tx.pago.create({
      data: {
        clubId, socioId, medio: pago.medio, intentoId: pago.intentoId,
        monto: deSocio.reduce((s, c) => s + c.monto, 0),
        pagadorId: socioId === pago.pagadorId ? null : pago.pagadorId,
      },
    });
    const { count } = await tx.cargo.updateMany({
      where: { id: { in: deSocio.map((c) => c.id) }, estado: "PENDIENTE" },
      data: { estado: "PAGADO", pagoId: p.id },
    });
    if (count !== deSocio.length) throw new DomainError("Alguno de los cargos ya fue pagado o anulado");
    pagos.push(p);
  }
  return pagos;
}
