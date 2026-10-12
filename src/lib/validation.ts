// Esquemas de entrada compartidos por Server Actions y API REST.
import { z } from "zod";

export const texto = (max: number) => z.string().trim().min(2, "Mínimo 2 caracteres").max(max);
export const entero = (min: number, max: number) => z.coerce.number().int("Debe ser entero").min(min).max(max);

export const emailOpcional = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || z.string().email().safeParse(v).success, "Email inválido")
  .transform((v) => v || null);

export const socioSchema = z.object({
  nombre: texto(60),
  apellido: texto(60),
  dni: z.string().trim().regex(/^\d{7,8}$/, "DNI: 7 u 8 dígitos"),
  email: emailOpcional,
  tipoSocioId: z.string().min(1, "Elegí un tipo de socio"),
});

export const actividadSchema = z.object({
  nombre: texto(60),
  diaSemana: entero(0, 6),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora con formato HH:MM"),
  cupo: entero(1, 500),
});

export type SocioInput = z.infer<typeof socioSchema>;
