// Cargos de la cuenta corriente: generación por período y anulación.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { periodoActual } from "@/lib/periodo";
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

/**
 * Al inscribirse a una actividad paga: por cada período ya generado en el club (el actual y, si el
 * admin lo adelantó, el siguiente) crea el cargo del arancel del mes completo, sin prorrateo, o
 * reactiva el anulado por una baja anterior. Los períodos sin generar los cubrirá la generación.
 * Corre en la transacción de la inscripción: si falla, no hay inscripción. Devuelve el primer
 * cargo creado o reactivado.
 */
export async function cargoPorInscripcion(
  tx: Prisma.TransactionClient,
  clubId: string,
  socioId: string,
  actividad: { id: string; nombre: string; arancel: number },
  hoy: Date = new Date(),
) {
  if (actividad.arancel <= 0) return null;
  const clave = claveActividad(actividad.id);
  let primero = null;

  for (const periodo of periodosGenerables(hoy)) {
    // Los cargos de eventos se crean sueltos: no indican que el período se haya generado.
    const generado = await tx.cargo.findFirst({ where: { clubId, periodo, concepto: { not: "EVENTO" } }, select: { id: true } });
    if (!generado) continue;

    const club = await tx.club.findUniqueOrThrow({ where: { id: clubId }, select: { diaVencimiento: true } });
    const vence = vencimiento(periodo, club.diaVencimiento);
    const existente = await tx.cargo.findUnique({ where: { socioId_periodo_clave: { socioId, periodo, clave } } });
    let cargo = null;
    if (existente?.estado === "ANULADO") {
      cargo = await tx.cargo.update({
        where: { id: existente.id },
        data: { estado: "PENDIENTE", monto: actividad.arancel, motivoAnulacion: null },
      });
    } else if (!existente) {
      cargo = await tx.cargo.create({
        data: {
          clubId, socioId, concepto: "ACTIVIDAD", actividadId: actividad.id, clave,
          descripcion: `${actividad.nombre} ${periodo}`, periodo, monto: actividad.arancel, vencimiento: vence,
        },
      });
    }
    primero ??= cargo;
  }
  return primero;
}

/** Clave de unicidad del cargo de un evento pago. */
export const claveEvento = (eventoId: string) => `EVT:${eventoId}`;

const dos = (n: number) => String(n).padStart(2, "0");

/**
 * Al inscribirse a un evento pago: crea un cargo único del período actual que vence el día del
 * evento, o reactiva el anulado por una baja anterior. Si ya lo había pagado, no se vuelve a cobrar.
 */
export async function cargoPorEvento(
  tx: Prisma.TransactionClient,
  clubId: string,
  socioId: string,
  evento: { id: string; titulo: string; precio: number; fecha: Date },
  hoy: Date = new Date(),
) {
  if (evento.precio <= 0) return null;
  const clave = claveEvento(evento.id);
  const existente = await tx.cargo.findFirst({ where: { clubId, socioId, clave } });
  if (existente?.estado === "PAGADO" || existente?.estado === "PENDIENTE") return null;
  if (existente) {
    return tx.cargo.update({
      where: { id: existente.id },
      data: { estado: "PENDIENTE", monto: evento.precio, motivoAnulacion: null },
    });
  }
  const fecha = `${dos(evento.fecha.getUTCDate())}/${dos(evento.fecha.getUTCMonth() + 1)}`;
  return tx.cargo.create({
    data: {
      clubId, socioId, concepto: "EVENTO", clave, descripcion: `${evento.titulo} (${fecha})`,
      periodo: periodoActual(hoy), monto: evento.precio, vencimiento: evento.fecha,
    },
  });
}

/** Anula los cargos pendientes de un evento (de un socio o, sin socioId, de todos). */
export async function anularCargosEvento(
  tx: Prisma.TransactionClient,
  clubId: string,
  eventoId: string,
  motivo: string,
  socioId?: string,
) {
  await tx.cargo.updateMany({
    where: { clubId, clave: claveEvento(eventoId), estado: "PENDIENTE", ...(socioId ? { socioId } : {}) },
    data: { estado: "ANULADO", motivoAnulacion: motivo },
  });
}

/**
 * Al cancelar una inscripción: anula los cargos de esa actividad que sigan pendientes del mes en
 * curso en adelante (el siguiente puede estar generado). Lo pagado no se reintegra y los meses
 * anteriores no se tocan.
 */
export async function anularPorCancelacion(
  tx: Prisma.TransactionClient,
  clubId: string,
  socioId: string,
  actividadId: string,
  hoy: Date = new Date(),
) {
  await tx.cargo.updateMany({
    where: {
      clubId,
      socioId,
      periodo: { gte: periodoActual(hoy) },
      clave: claveActividad(actividadId),
      estado: "PENDIENTE",
    },
    data: { estado: "ANULADO", motivoAnulacion: "Baja de actividad" },
  });
}
