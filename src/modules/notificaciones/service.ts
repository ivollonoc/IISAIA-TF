// Bandeja in-app de cada usuario, avisos manuales y buzón de salida.
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { canalesActivos } from "./canales";
import { adminsDeClub, audiencia } from "./destinatarios";
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

/** Aviso del admin de club a todos los socios o a los participantes de una actividad; queda en el historial. */
export async function enviarAvisoClub(clubId: string, input: unknown, autorId?: string) {
  const data = avisoClubSchema.parse(input);
  const club = await db.club.findUniqueOrThrow({ where: { id: clubId }, select: { canales: true } });
  let para = "Todos los socios";
  if (data.actividadId) {
    const actividad = await db.actividad.findFirst({ where: { id: data.actividadId, clubId }, select: { nombre: true } });
    if (!actividad) throw new DomainError("Actividad no encontrada");
    para = `Participantes de ${actividad.nombre}`;
  }
  const destinatarios = (await audiencia(clubId, data.actividadId)).length;
  await notificar(clubId, { tipo: "AVISO_CLUB", asunto: data.asunto, mensaje: data.mensaje, actividadId: data.actividadId });
  await db.avisoEnviado.create({
    data: {
      origen: "CLUB", clubId, autorId: autorId ?? null, asunto: data.asunto, mensaje: data.mensaje, para, destinatarios,
      canales: canalesActivos(club.canales),
    },
  });
  return { destinatarios };
}

/** Aviso del admin general a los admins de club (de todos o de uno); queda en el historial. */
export async function enviarAvisoPlataforma(input: unknown, autorId?: string) {
  const data = avisoPlataformaSchema.parse(input);
  let para = "Todos los clubes";
  if (data.clubId) {
    const club = await db.club.findUnique({ where: { id: data.clubId }, select: { nombre: true } });
    if (!club) throw new DomainError("Club no encontrado");
    para = club.nombre;
  }
  const destinatarios = (await adminsDeClub(data.clubId)).length;
  await notificarAdmins({ asunto: data.asunto, mensaje: data.mensaje, clubId: data.clubId });
  await db.avisoEnviado.create({
    data: {
      origen: "PLATAFORMA", autorId: autorId ?? null, asunto: data.asunto, mensaje: data.mensaje, para, destinatarios,
      canales: ["IN_APP", "EMAIL"],
    },
  });
  return { destinatarios };
}

/** Avisos manuales enviados por un club (o por la plataforma), más recientes primero. */
export function historialAvisos(origen: "CLUB" | "PLATAFORMA", clubId?: string, limite = 50) {
  return db.avisoEnviado.findMany({
    where: origen === "CLUB" ? { origen, clubId } : { origen },
    orderBy: { createdAt: "desc" },
    take: limite,
  });
}
