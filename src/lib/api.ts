// Helpers para la API REST: auth por sesión JWT y respuestas JSON uniformes.
import { NextResponse } from "next/server";
import { db } from "./db";
import { mensajeDeError } from "./errors";
import { getUsuario } from "./session";
import { puedeAcceder, type AreaClub } from "./permisos";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
const fallo = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Resuelve usuario + club y verifica acceso; si falla devuelve la respuesta de error. */
export async function apiClub(slug: string, areas: AreaClub[]) {
  const user = await getUsuario();
  if (!user) return { error: fallo("No autenticado", 401) } as const;
  const club = await db.club.findUnique({ where: { slug } });
  if (!club) return { error: fallo("Club no encontrado", 404) } as const;
  if (!areas.some((a) => puedeAcceder(user, club.id, a))) return { error: fallo("Sin permiso", 403) } as const;
  return { user, club } as const;
}

/** Ejecuta un handler mapeando errores de dominio/validación a 400. */
export async function manejar(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    const msg = mensajeDeError(e);
    if (msg) return fallo(msg, 400);
    console.error(e);
    return fallo("Error interno", 500);
  }
}
