// Altas, modificaciones y bajas lógicas de socios de un club.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { periodoActual } from "@/lib/periodo";
import { socioSchema, type SocioInput } from "@/lib/validation";

export function listarSocios(clubId: string) {
  return db.socio.findMany({
    where: { clubId },
    orderBy: { nroSocio: "asc" },
    include: {
      tipoSocio: true,
      pagos: { where: { periodo: periodoActual() }, select: { id: true } },
    },
  });
}

export async function obtenerSocio(clubId: string, socioId: string) {
  const socio = await db.socio.findFirst({
    where: { id: socioId, clubId },
    include: {
      tipoSocio: true,
      pagos: { orderBy: { periodo: "desc" } },
      inscripciones: { include: { actividad: true } },
    },
  });
  if (!socio) throw new DomainError("Socio no encontrado");
  return socio;
}

async function validarTipo(tx: Prisma.TransactionClient, clubId: string, tipoSocioId: string) {
  const tipo = await tx.tipoSocio.findFirst({ where: { id: tipoSocioId, clubId } });
  if (!tipo) throw new DomainError("Tipo de socio inválido");
}

/** Vincula (o crea) el usuario de login del socio si tiene email. */
async function vincularUsuario(tx: Prisma.TransactionClient, clubId: string, email: string | null) {
  if (!email) return null;
  const existente = await tx.usuario.findUnique({ where: { email } });
  if (existente && (existente.rol !== "SOCIO" || existente.clubId !== clubId)) {
    throw new DomainError("Ese email ya pertenece a otro usuario");
  }
  if (existente) return existente.id;
  const nuevo = await tx.usuario.create({ data: { email, rol: "SOCIO", clubId } });
  return nuevo.id;
}

export async function crearSocio(clubId: string, input: unknown) {
  const data: SocioInput = socioSchema.parse(input);

  return db.$transaction(async (tx) => {
    await validarTipo(tx, clubId, data.tipoSocioId);
    const ultimo = await tx.socio.aggregate({ where: { clubId }, _max: { nroSocio: true } });
    const usuarioId = await vincularUsuario(tx, clubId, data.email);
    return tx.socio.create({
      data: { ...data, clubId, usuarioId, nroSocio: (ultimo._max.nroSocio ?? 0) + 1 },
    });
  });
}

export async function actualizarSocio(clubId: string, socioId: string, input: unknown) {
  const data: SocioInput = socioSchema.parse(input);

  return db.$transaction(async (tx) => {
    const actual = await tx.socio.findFirst({ where: { id: socioId, clubId } });
    if (!actual) throw new DomainError("Socio no encontrado");
    await validarTipo(tx, clubId, data.tipoSocioId);
    const usuarioId = data.email === actual.email ? actual.usuarioId : await vincularUsuario(tx, clubId, data.email);
    return tx.socio.update({ where: { id: socioId }, data: { ...data, usuarioId } });
  });
}

/** Baja/alta lógica: el historial de pagos se conserva. */
export async function cambiarEstadoSocio(clubId: string, socioId: string, activo: boolean) {
  const { count } = await db.socio.updateMany({ where: { id: socioId, clubId }, data: { activo } });
  if (count === 0) throw new DomainError("Socio no encontrado");
}
