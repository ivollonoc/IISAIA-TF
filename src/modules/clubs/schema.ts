// Validación de entrada del módulo clubs.
import { z } from "zod";
import { casilla, entero, texto } from "@/lib/validation";

export const clubSchema = z.object({
  nombre: texto(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug: minúsculas, números y guiones")
    .min(3)
    .max(40),
  adminEmail: z.string().trim().toLowerCase().email("Email inválido"),
});

/** Configuración del club editable por su admin. */
export const configClubSchema = z.object({
  diaVencimiento: entero(1, 28),
});

/** Vías de aviso a los socios: checkboxes EMAIL y SMS (in-app va siempre). */
export const canalesSchema = z
  .object({ EMAIL: casilla, SMS: casilla })
  .transform(({ EMAIL, SMS }) => ["IN_APP" as const, ...(EMAIL ? ["EMAIL" as const] : []), ...(SMS ? ["SMS" as const] : [])]);
