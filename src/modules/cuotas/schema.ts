// Validación de entrada del módulo cuotas (tipos de socio y pagos).
import { z } from "zod";
import { PERIODO_REGEX } from "@/lib/periodo";
import { entero, texto } from "@/lib/validation";

export const tipoSocioSchema = z.object({
  nombre: texto(40),
  cuotaMensual: entero(0, 10_000_000),
});

export const pagoSchema = z.object({
  socioId: z.string().min(1),
  periodo: z.string().regex(PERIODO_REGEX, "Período con formato YYYY-MM"),
  monto: entero(1, 10_000_000),
  medio: z.enum(["EFECTIVO", "TRANSFERENCIA", "OTRO"]),
});
