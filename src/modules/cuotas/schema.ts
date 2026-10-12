// Validación de entrada del módulo cuotas (tipos de socio).
import { z } from "zod";
import { entero, texto } from "@/lib/validation";

export const tipoSocioSchema = z.object({
  nombre: texto(40),
  cuotaMensual: entero(0, 10_000_000),
});
