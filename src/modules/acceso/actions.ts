"use server";

// Login sin contraseña: pedir el link mágico y reenviar invitaciones.
import { z } from "zod";
import { ejecutar, rutaAdmin } from "@/lib/action";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { demoHabilitado } from "@/lib/auth";
import { requireClub } from "@/lib/session";
import { proveedorEmail } from "@/modules/notificaciones/canales";
import { enviarInvitacion, solicitarLink } from "./service";

export interface EstadoLink {
  enviado: boolean;
  error?: string;
  /** Solo en modo demo con mail simulado: el link, para poder seguir sin casilla de correo. */
  linkDemo?: string | null;
}

export async function solicitarLinkAction(_previo: EstadoLink, formData: FormData): Promise<EstadoLink> {
  const email = z.string().trim().email().safeParse(formData.get("email"));
  if (!email.success) return { enviado: false, error: "Ingresá un email válido" };
  const { link } = await solicitarLink(email.data);
  const mostrar = demoHabilitado && proveedorEmail() === "simulado";
  return { enviado: true, linkDemo: mostrar ? link : undefined };
}

/** El admin reenvía la invitación a un socio (por ejemplo, si se le venció). */
export async function reenviarInvitacionAction(slug: string, socioId: string) {
  await ejecutar(`${rutaAdmin(slug)}/socios/${socioId}`, async () => {
    const { club } = await requireClub(slug, "admin");
    const socio = await db.socio.findFirst({ where: { id: socioId, clubId: club.id }, select: { usuarioId: true } });
    if (!socio?.usuarioId) throw new DomainError("El socio no tiene email para invitar");
    await enviarInvitacion(socio.usuarioId);
    return "Invitación reenviada por mail";
  });
}
