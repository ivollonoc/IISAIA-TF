// Tokens de un solo uso para entrar sin contraseña. En la base solo queda el hash (sha256): quien
// lea la tabla no puede armar un link válido.
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";

export type TipoToken = "LOGIN" | "INVITACION";

const VIGENCIA_MS: Record<TipoToken, number> = {
  LOGIN: 15 * 60_000,
  INVITACION: 7 * 24 * 60 * 60_000,
};

const hashDe = (token: string) => createHash("sha256").update(token).digest("hex");

export async function crearToken(usuarioId: string, tipo: TipoToken, ahora: Date = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.tokenAcceso.create({
    data: { usuarioId, tipo, hash: hashDe(token), expira: new Date(ahora.getTime() + VIGENCIA_MS[tipo]) },
  });
  return token;
}

/** Valida el token y lo marca usado (de forma atómica: dos usos simultáneos no pasan). */
export async function consumirToken(token: string, ahora: Date = new Date()) {
  const { count } = await db.tokenAcceso.updateMany({
    where: { hash: hashDe(token), usadoAt: null, expira: { gt: ahora } },
    data: { usadoAt: ahora },
  });
  if (count === 0) throw new DomainError("El link no es válido o ya venció");
  const { usuario } = await db.tokenAcceso.findUniqueOrThrow({ where: { hash: hashDe(token) }, include: { usuario: true } });
  return usuario;
}
