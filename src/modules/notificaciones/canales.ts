// Canales de aviso. In-app escribe en la bandeja; mail y SMS quedan registrados en el buzón de
// salida (MensajeSaliente). El mail sale de verdad solo si hay RESEND_API_KEY y EMAIL_FROM.
import type { CanalAviso } from "@prisma/client";
import { db } from "@/lib/db";
import { urlVisible } from "@/lib/tenant";

export interface Destinatario {
  usuarioId: string | null;
  email: string | null;
  telefono: string | null;
}

export interface Entrega {
  destinatario: Destinatario;
  titulo: string;
  cuerpo: string;
  link: string | null;
}

export function proveedorEmail(): "resend" | "simulado" {
  return process.env.RESEND_API_KEY && process.env.EMAIL_FROM ? "resend" : "simulado";
}

async function enviarResend(destino: string, asunto: string, cuerpo: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: destino, subject: asunto, text: cuerpo }),
  });
  if (!r.ok) throw new Error(`Resend respondió ${r.status}`);
}

/**
 * Proveedores de cada canal, en un objeto para poder reemplazarlos en los tests. Cada uno deja
 * constancia en el buzón de salida, se haya enviado de verdad o no.
 */
export const proveedores = {
  async email(clubId: string | null, destino: string, asunto: string, cuerpo: string) {
    const proveedor = proveedorEmail();
    if (proveedor === "resend") await enviarResend(destino, asunto, cuerpo);
    await db.mensajeSaliente.create({ data: { clubId, canal: "EMAIL", destino, asunto, cuerpo, proveedor } });
  },
  async sms(clubId: string | null, destino: string, texto: string) {
    await db.mensajeSaliente.create({ data: { clubId, canal: "SMS", destino, cuerpo: texto, proveedor: "simulado" } });
  },
};

/** Canales a usar: in-app siempre, más los que el club activó. */
export const canalesActivos = (canales: CanalAviso[]): CanalAviso[] => ["IN_APP", ...canales.filter((c) => c !== "IN_APP")];

/**
 * Envía cada entrega por los canales activos. In-app va en bloque; mail y SMS uno por uno y un
 * error en uno no corta el resto (se registra y sigue).
 */
export async function entregar(clubId: string | null, tipo: string, entregas: Entrega[], canales: CanalAviso[]) {
  const enApp = entregas.filter((e) => e.destinatario.usuarioId);
  if (enApp.length) {
    await db.notificacion.createMany({
      data: enApp.map((e) => ({
        usuarioId: e.destinatario.usuarioId!, clubId, tipo, titulo: e.titulo, cuerpo: e.cuerpo, link: e.link,
      })),
    });
  }
  for (const e of entregas) {
    const envios: Promise<unknown>[] = [];
    if (canales.includes("EMAIL") && e.destinatario.email) {
      const pie = e.link ? `\n\nVer en la app: ${urlVisible(e.link)}` : "";
      envios.push(proveedores.email(clubId, e.destinatario.email, e.titulo, `${e.cuerpo}${pie}`));
    }
    if (canales.includes("SMS") && e.destinatario.telefono) {
      envios.push(proveedores.sms(clubId, e.destinatario.telefono, `${e.titulo}: ${e.cuerpo}`));
    }
    for (const r of await Promise.allSettled(envios)) {
      if (r.status === "rejected") console.error(`No se pudo enviar el aviso "${e.titulo}"`, r.reason);
    }
  }
}
