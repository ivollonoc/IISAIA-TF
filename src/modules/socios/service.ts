// Altas, modificaciones y bajas lógicas de socios de un club.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { invitarSinFallar } from "@/modules/acceso/service";
import { socioSchema, type SocioInput } from "./schema";

export function listarSocios(clubId: string) {
  return db.socio.findMany({
    where: { clubId },
    orderBy: { nroSocio: "asc" },
    include: {
      tipoSocio: true,
    },
  });
}

export async function obtenerSocio(clubId: string, socioId: string) {
  const socio = await db.socio.findFirst({
    where: { id: socioId, clubId },
    include: {
      tipoSocio: true,
      titular: { select: { id: true, nombre: true, apellido: true } },
      _count: { select: { familiares: true } },
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

  const socio = await db.$transaction(async (tx) => {
    await validarTipo(tx, clubId, data.tipoSocioId);
    const ultimo = await tx.socio.aggregate({ where: { clubId }, _max: { nroSocio: true } });
    const usuarioId = await vincularUsuario(tx, clubId, data.email);
    return tx.socio.create({
      data: { ...data, clubId, usuarioId, nroSocio: (ultimo._max.nroSocio ?? 0) + 1 },
    });
  });
  // Con email, el socio recibe la invitación para entrar a la autogestión.
  if (socio.usuarioId) await invitarSinFallar(socio.usuarioId);
  return socio;
}

export async function actualizarSocio(clubId: string, socioId: string, input: unknown) {
  const data: SocioInput = socioSchema.parse(input);

  const { socio, emailNuevo } = await db.$transaction(async (tx) => {
    const actual = await tx.socio.findFirst({ where: { id: socioId, clubId } });
    if (!actual) throw new DomainError("Socio no encontrado");
    await validarTipo(tx, clubId, data.tipoSocioId);
    const usuarioId = data.email === actual.email ? actual.usuarioId : await vincularUsuario(tx, clubId, data.email);
    const socio = await tx.socio.update({ where: { id: socioId }, data: { ...data, usuarioId } });
    return { socio, emailNuevo: Boolean(data.email) && data.email !== actual.email };
  });
  if (emailNuevo && socio.usuarioId) await invitarSinFallar(socio.usuarioId);
  return socio;
}

/** Baja/alta lógica: la cuenta corriente se conserva. */
export async function cambiarEstadoSocio(clubId: string, socioId: string, activo: boolean) {
  const { count } = await db.socio.updateMany({
    where: { id: socioId, clubId },
    data: { activo, bajaAt: activo ? null : new Date() },
  });
  if (count === 0) throw new DomainError("Socio no encontrado");
}
