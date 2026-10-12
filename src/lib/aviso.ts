// Mensajes de resultado que viajan en la URL (?ok= / ?error=), firmados con NEXTAUTH_SECRET:
// un link armado a mano no puede mostrar textos arbitrarios bajo la marca del club.
import { createHmac, timingSafeEqual } from "node:crypto";

type TipoAviso = "ok" | "error";

const firmar = (tipo: TipoAviso, texto: string) =>
  createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "dev").update(`${tipo}:${texto}`).digest("base64url").slice(0, 22);

function firmaValida(tipo: TipoAviso, texto: string, firma: string | undefined): boolean {
  if (!firma) return false;
  const esperada = Buffer.from(firmar(tipo, texto));
  const recibida = Buffer.from(firma);
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

/** Query string con el mensaje firmado, p. ej. "ok=Pago%20aprobado&f=…". */
export function queryAviso(tipo: TipoAviso, texto: string): string {
  return `${tipo}=${encodeURIComponent(texto)}&f=${firmar(tipo, texto)}`;
}

/** Mensaje a mostrar con <Aviso>: solo si la firma corresponde. */
export function leerAviso(p: { ok?: string; error?: string; f?: string }): { ok?: string; error?: string } {
  if (p.error !== undefined) return firmaValida("error", p.error, p.f) ? { error: p.error } : {};
  if (p.ok !== undefined) return firmaValida("ok", p.ok, p.f) ? { ok: p.ok } : {};
  return {};
}
