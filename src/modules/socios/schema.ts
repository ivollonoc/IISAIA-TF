// Validación de entrada del módulo socios.
import { z } from "zod";
import { emailOpcional, texto } from "@/lib/validation";

export const socioSchema = z.object({
  nombre: texto(60),
  apellido: texto(60),
  dni: z.string().trim().regex(/^\d{7,8}$/, "DNI: 7 u 8 dígitos"),
  email: emailOpcional,
  telefono: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\+?[\d][\d\s-]{5,19}$/.test(v), "Teléfono inválido")
    .optional()
    .transform((v) => v || null),
  tipoSocioId: z.string().min(1, "Elegí un tipo de socio"),
});

export type SocioInput = z.infer<typeof socioSchema>;
