// Validación de entrada del módulo clubs.
import { z } from "zod";
import { texto } from "@/lib/validation";

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
