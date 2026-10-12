// Validación de entrada del módulo calendario. Las fechas llegan como "AAAA-MM-DD" (input date).
import { z } from "zod";
import { texto } from "@/lib/validation";
import { parsearDia } from "./reglas";

const dia = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const fecha = parsearDia(v);
    if (!fecha) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fecha inválida" });
      return z.NEVER;
    }
    return fecha;
  });

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora con formato HH:MM");

/** Texto opcional de formulario: "" o ausente → null. */
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const suspenderClaseSchema = z.object({
  actividadId: z.string().min(1),
  fecha: dia,
  motivo: texto(200),
});

export const reprogramarClaseSchema = suspenderClaseSchema.extend({
  nuevaFecha: dia,
  nuevaHora: hora,
});

export const eventoSchema = z.object({
  titulo: texto(80),
  fecha: dia,
  hora,
  lugar: opcional(80),
  descripcion: opcional(500),
  actividadId: opcional(64),
});
