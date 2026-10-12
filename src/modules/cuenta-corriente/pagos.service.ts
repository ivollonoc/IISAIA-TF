// Pagos: la única vía para cancelar cargos (la usan el pago manual del admin y el checkout online).
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
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

  return tx ? registrar(tx) : db.$transaction(registrar);
}
