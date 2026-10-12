// Bandeja in-app de cada usuario, avisos manuales y buzón de salida.
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { audiencia } from "./destinatarios";
import { notificar, notificarAdmins } from "./emitir";
import { avisoClubSchema, avisoPlataformaSchema } from "./schema";

export function listarNotificaciones(usuarioId: string, limite = 50) {
  return db.notificacion.findMany({ where: { usuarioId }, orderBy: { createdAt: "desc" }, take: limite });
}

export function contarNoLeidas(usuarioId: string) {
  return db.notificacion.count({ where: { usuarioId, leidaAt: null } });
}

export function ultimasNoLeidas(usuarioId: string, n = 3) {
  return db.notificacion.findMany({ where: { usuarioId, leidaAt: null }, orderBy: { createdAt: "desc" }, take: n });
}

/** Solo rutas internas ("/c/…"): nunca "//otro.com" ni URLs absolutas. */
const linkInterno = (link: string | null) => (link && /^\/(?!\/)/.test(link) ? link : null);

/** Marca leída una notificación propia y devuelve su link interno (o null). */
export async function marcarLeida(usuarioId: string, id: string): Promise<string | null> {
  const n = await db.notificacion.findFirst({ where: { id, usuarioId } });
  if (!n) return null;
  if (!n.leidaAt) await db.notificacion.update({ where: { id }, data: { leidaAt: new Date() } });
  return linkInterno(n.link);
}

export async function marcarTodasLeidas(usuarioId: string) {
  await db.notificacion.updateMany({ where: { usuarioId, leidaAt: null }, data: { leidaAt: new Date() } });
}

/** Aviso del admin de club a todos los socios o a los inscriptos de una actividad. */
export async function enviarAvisoClub(clubId: string, input: unknown) {
  const data = avisoClubSchema.parse(input);
  if (data.actividadId) {
    const actividad = await db.actividad.findFirst({ where: { id: data.actividadId, clubId }, select: { id: true } });
    if (!actividad) throw new DomainError("Actividad no encontrada");
  }
  const destinatarios = (await audiencia(clubId, data.actividadId)).length;
  await notificar(clubId, { tipo: "AVISO_CLUB", asunto: data.asunto, mensaje: data.mensaje, actividadId: data.actividadId });
  return { destinatarios };
}

/** Aviso del admin general a los admins de club (de todos o de uno). */
export async function enviarAvisoPlataforma(input: unknown) {
  const data = avisoPlataformaSchema.parse(input);
  if (data.clubId && !(await db.club.findUnique({ where: { id: data.clubId }, select: { id: true } }))) {
    throw new DomainError("Club no encontrado");
  }
  await notificarAdmins({ asunto: data.asunto, mensaje: data.mensaje, clubId: data.clubId });
}

/** Mails y SMS enviados: de un club o (null) de toda la plataforma. */
export function buzonSalida(clubId: string | null, limite = 50) {
  return db.mensajeSaliente.findMany({
    where: clubId ? { clubId } : {},
    orderBy: { createdAt: "desc" },
    take: limite,
    include: { club: { select: { nombre: true } } },
  });
}
