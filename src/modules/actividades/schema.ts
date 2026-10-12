// Validación de entrada del módulo actividades.
import { z } from "zod";
import { entero, texto } from "@/lib/validation";

export const actividadSchema = z.object({
  nombre: texto(60),
  diaSemana: entero(0, 6),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora con formato HH:MM"),
  cupo: entero(1, 500),
  arancel: entero(0, 10_000_000).default(0),
  duracionMin: entero(15, 600).default(60),
});
