import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

/** Error de regla de negocio: su mensaje se muestra tal cual al usuario. */
export class DomainError extends Error {}

/** Traduce errores esperables a un mensaje legible; devuelve null si es inesperado. */
export function mensajeDeError(e: unknown): string | null {
  if (e instanceof DomainError) return e.message;
  if (e instanceof ZodError) {
    const issue = e.issues[0];
    return issue ? `${issue.path.join(".")}: ${issue.message}` : "Datos inválidos";
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return "Ya existe un registro con esos datos";
    // Conflicto de transacción serializable (p. ej. dos inscripciones al último cupo).
    if (e.code === "P2034") return "Hubo un conflicto con otra operación, intentá de nuevo";
  }
  return null;
}
