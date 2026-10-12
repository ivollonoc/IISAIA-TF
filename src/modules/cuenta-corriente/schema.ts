// Validación de entrada del módulo cuenta corriente.
import { z } from "zod";
import { PERIODO_REGEX } from "@/lib/periodo";
import { texto } from "@/lib/validation";

export const registrarPagoSchema = z.object({
  socioId: z.string().min(1),
  cargoIds: z
    .array(z.string().min(1))
    .min(1, "Elegí al menos un cargo")
    .transform((ids) => [...new Set(ids)]),
  medio: z.enum(["EFECTIVO", "TRANSFERENCIA", "ONLINE", "OTRO"]),
  registradoPor: z.string().min(1).nullish(),
});

export const generarCargosSchema = z.object({
  periodo: z.string().regex(PERIODO_REGEX, "Período con formato YYYY-MM"),
});

export const anularCargoSchema = z.object({
  motivo: texto(200),
});

/** Medios de un pago registrado por el admin en ventanilla (ONLINE solo lo registra el checkout). */
export const medioVentanillaSchema = z.enum(["EFECTIVO", "TRANSFERENCIA", "OTRO"], {
  errorMap: () => ({ message: "Medio de pago inválido" }),
});
