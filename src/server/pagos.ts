// Cobros: en v1 el admin registra pagos manuales (efectivo/transferencia).
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { periodoActual } from "@/lib/periodo";
import { pagoSchema } from "@/lib/validation";

export async function registrarPago(clubId: string, input: unknown) {
  const data = pagoSchema.parse(input);
  const socio = await db.socio.findFirst({ where: { id: data.socioId, clubId } });
  if (!socio) throw new DomainError("Socio no encontrado");
  // @@unique([socioId, periodo]) impide registrar dos veces el mismo mes.
  return db.pago.create({ data: { ...data, clubId } });
}

/** Indicadores del tablero del club para el período actual. */
export async function resumenClub(clubId: string) {
  const periodo = periodoActual();
  const [activos, alDia, recaudado, actividades] = await Promise.all([
    db.socio.count({ where: { clubId, activo: true } }),
    db.socio.count({ where: { clubId, activo: true, pagos: { some: { periodo } } } }),
    db.pago.aggregate({ where: { clubId, periodo }, _sum: { monto: true } }),
    db.actividad.count({ where: { clubId, activa: true } }),
  ]);
  return { periodo, activos, alDia, morosos: activos - alDia, recaudado: recaudado._sum.monto ?? 0, actividades };
}
