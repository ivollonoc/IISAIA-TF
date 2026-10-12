// Helpers de validación compartidos por los esquemas de cada módulo (src/modules/*/schema.ts).
import { z } from "zod";

export const texto = (max: number) => z.string().trim().min(2, "Mínimo 2 caracteres").max(max);
export const entero = (min: number, max: number) => z.coerce.number().int("Debe ser entero").min(min).max(max);

export const emailOpcional = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || z.string().email().safeParse(v).success, "Email inválido")
  .transform((v) => v || null);
