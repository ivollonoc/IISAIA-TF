// Helpers de validación compartidos por los esquemas de cada módulo (src/modules/*/schema.ts).
import { z } from "zod";

export const texto = (max: number) => z.string().trim().min(2, "Mínimo 2 caracteres").max(max);
export const entero = (min: number, max: number) => z.coerce.number().int("Debe ser entero").min(min).max(max);

/** "AAAA-MM-DD" (input date) → medianoche UTC. */
export const dia = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null;
    if (!fecha || Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== v) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fecha inválida" });
      return z.NEVER;
    }
    return fecha;
  });

export const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora con formato HH:MM");

/** Texto opcional de formulario: "" o ausente → null. */
export const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

/** Checkbox de formulario: "on" (o true) → true; ausente → false. */
export const casilla = z.union([z.literal("on"), z.boolean()]).optional().transform((v) => v === "on" || v === true);

export const emailOpcional = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || z.string().email().safeParse(v).success, "Email inválido")
  .transform((v) => v || null);
