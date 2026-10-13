// Acceso sin contraseña: usuarios demo (solo con DEMO_LOGIN), link mágico por mail e invitaciones
// al crear un club o un socio.
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { proveedores } from "@/modules/notificaciones/canales";
import { consumirToken, crearToken } from "./tokens";

/** Base de los links que van por mail (en local, una ruta relativa alcanza para la demo). */
const urlBase = () => (process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
const linkDe = (token: string) => `${urlBase()}/ingresar/${token}`;
const normalizar = (email: string) => email.trim().toLowerCase();

/**
 * Manda un link para entrar (vale 15 minutos y una vez) si el email está registrado (y, con
 * `clubId`, si es de ese club). Devuelve el link (o null) para que la pantalla de demo pueda
 * mostrarlo cuando el mail es simulado.
 */
export async function solicitarLink(email: string, ahora: Date = new Date(), clubId?: string): Promise<{ link: string | null }> {
  const usuario = await db.usuario.findUnique({ where: { email: normalizar(email) } });
  // Desde la página (o el subdominio) de un club, solo entran sus usuarios.
  if (!usuario || (clubId && usuario.clubId !== clubId)) return { link: null };
  const link = linkDe(await crearToken(usuario.id, "LOGIN", ahora));
  await proveedores.email(
    usuario.clubId,
    usuario.email,
    "Tu link para entrar",
    `Entrá a Gestión de Socios con este link (vale 15 minutos y una sola vez):\n\n${link}\n\nSi no lo pediste, ignorá este mail.`,
  );
  return { link };
}

/** Invitación a activar la cuenta (vale 7 días): para el admin de un club nuevo o un socio con email. */
export async function enviarInvitacion(usuarioId: string, ahora: Date = new Date()): Promise<string> {
  const usuario = await db.usuario.findUnique({ where: { id: usuarioId }, include: { club: { select: { nombre: true } } } });
  if (!usuario) throw new DomainError("Usuario no encontrado");
  const link = linkDe(await crearToken(usuario.id, "INVITACION", ahora));
  const club = usuario.club?.nombre ?? "Gestión de Socios";
  const asunto = usuario.rol === "ADMIN_CLUB" ? `Te invitaron a administrar ${club}` : `Te invitaron a ${club}`;
  await proveedores.email(
    usuario.clubId,
    usuario.email,
    asunto,
    `Hola! Ya tenés cuenta en ${club}. Entrá con este link (vale 7 días):\n\n${link}\n\nDespués podés volver a entrar con tu email desde la página principal.`,
  );
  return link;
}

/** Invita sin romper la operación que la disparó (crear club o socio) si el mail falla. */
export async function invitarSinFallar(usuarioId: string) {
  try {
    await enviarInvitacion(usuarioId);
  } catch (e) {
    console.error("No se pudo enviar la invitación", e);
  }
}

const sesion = (u: { id: string; email: string; nombre: string | null }) => ({ id: u.id, email: u.email, name: u.nombre });

/** Login sin link: solo usuarios marcados como demo. */
export async function autorizarDemo(email: string) {
  const u = await db.usuario.findUnique({ where: { email: normalizar(email) } });
  return u?.demo ? sesion(u) : null;
}

/** Login con link mágico o invitación: el token se consume (un solo uso). */
export async function autorizarLink(token: string) {
  try {
    return sesion(await consumirToken(token));
  } catch (e) {
    if (e instanceof DomainError) return null;
    throw e;
  }
}
