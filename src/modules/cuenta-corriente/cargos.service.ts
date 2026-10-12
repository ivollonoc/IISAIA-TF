// Cargos de la cuenta corriente: generación por período y anulación.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { periodosGenerables, vencimiento } from "./reglas";
import { anularCargoSchema, generarCargosSchema } from "./schema";

/** Clave de unicidad del cargo de una actividad (el de cuota social usa "CUOTA"). */
export const claveActividad = (actividadId: string) => `ACT:${actividadId}`;

/**
 * Genera la cuota social de cada socio activo y el arancel de cada actividad paga y activa en la
 * que está inscripto. Idempotente (UNIQUE socio+período+clave con skipDuplicates): correrla de
 * nuevo, o en paralelo, no duplica. Pensada para el botón del admin y, más adelante, un cron.
 */
export async function generarCargosPeriodo(clubId: string, input: unknown, hoy: Date = new Date()) {
  const { periodo } = generarCargosSchema.parse(input);
  if (!periodosGenerables(hoy).includes(periodo)) {
    throw new DomainError("Solo se pueden generar cargos del mes actual o del siguiente");
  }
  const club = await db.club.findUnique({ where: { id: clubId }, select: { diaVencimiento: true } });
  if (!club) throw new DomainError("Club no encontrado");
  const vence = vencimiento(periodo, club.diaVencimiento);

  const socios = await db.socio.findMany({
    where: { clubId, activo: true },
    select: {
      id: true,
      tipoSocio: { select: { cuotaMensual: true } },
      inscripciones: {
        where: { actividad: { activa: true, arancel: { gt: 0 } } },
        select: { actividad: { select: { id: true, nombre: true, arancel: true } } },
      },
    },
  });

  const filas: Prisma.CargoCreateManyInput[] = [];
  for (const s of socios) {
    if (s.tipoSocio.cuotaMensual > 0) {
      filas.push({
        clubId, socioId: s.id, concepto: "CUOTA", clave: "CUOTA", descripcion: `Cuota social ${periodo}`,
        periodo, monto: s.tipoSocio.cuotaMensual, vencimiento: vence,
      });
    }
    for (const { actividad: a } of s.inscripciones) {
      filas.push({
        clubId, socioId: s.id, concepto: "ACTIVIDAD", actividadId: a.id, clave: claveActividad(a.id),
        descripcion: `${a.nombre} ${periodo}`, periodo, monto: a.arancel, vencimiento: vence,
      });
    }
  }

  const { count } = filas.length ? await db.cargo.createMany({ data: filas, skipDuplicates: true }) : { count: 0 };
  return { creados: count, existentes: filas.length - count };
}

/** Anula un cargo pendiente (p. ej. generado por error). El cargo queda visible, tachado. */
export async function anularCargo(clubId: string, cargoId: string, input: unknown) {
  const { motivo } = anularCargoSchema.parse(input);
  const { count } = await db.cargo.updateMany({
    where: { id: cargoId, clubId, estado: "PENDIENTE" },
    data: { estado: "ANULADO", motivoAnulacion: motivo },
  });
  if (count === 1) return;
  const existe = await db.cargo.findFirst({ where: { id: cargoId, clubId }, select: { id: true } });
  throw new DomainError(existe ? "Solo se pueden anular cargos pendientes" : "Cargo no encontrado");
}
