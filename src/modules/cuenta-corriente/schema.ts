// Validación de entrada del módulo cuenta corriente.
import { z } from "zod";

export const registrarPagoSchema = z.object({
  socioId: z.string().min(1),
  cargoIds: z
    .array(z.string().min(1))
    .min(1, "Elegí al menos un cargo")
    .transform((ids) => [...new Set(ids)]),
  medio: z.enum(["EFECTIVO", "TRANSFERENCIA", "ONLINE", "OTRO"]),
  registradoPor: z.string().min(1).nullish(),
});
