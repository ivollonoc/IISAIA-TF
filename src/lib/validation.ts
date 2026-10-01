// Esquemas de entrada compartidos por Server Actions y API REST.
import { z } from "zod";
import { PERIODO_REGEX } from "./periodo";

const texto = (max: number) => z.string().trim().min(2, "Mínimo 2 caracteres").max(max);
const entero = (min: number, max: number) => z.coerce.number().int("Debe ser entero").min(min).max(max);

const emailOpcional = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || z.string().email().safeParse(v).success, "Email inválido")
  .transform((v) => v || null);

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

export const tipoSocioSchema = z.object({
  nombre: texto(40),
  cuotaMensual: entero(0, 10_000_000),
});

export const socioSchema = z.object({
  nombre: texto(60),
  apellido: texto(60),
  dni: z.string().trim().regex(/^\d{7,8}$/, "DNI: 7 u 8 dígitos"),
  email: emailOpcional,
  tipoSocioId: z.string().min(1, "Elegí un tipo de socio"),
});

export const pagoSchema = z.object({
  socioId: z.string().min(1),
  periodo: z.string().regex(PERIODO_REGEX, "Período con formato YYYY-MM"),
  monto: entero(1, 10_000_000),
  medio: z.enum(["EFECTIVO", "TRANSFERENCIA", "OTRO"]),
});

export const actividadSchema = z.object({
  nombre: texto(60),
  diaSemana: entero(0, 6),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora con formato HH:MM"),
  cupo: entero(1, 500),
});

export type SocioInput = z.infer<typeof socioSchema>;
