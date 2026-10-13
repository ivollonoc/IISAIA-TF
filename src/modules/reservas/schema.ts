// Validación de entrada de reservas. Una clase es (actividad, fecha, hora original).
import { z } from "zod";
import { dia, entero, hora } from "@/lib/validation";

export const claseSchema = z.object({
  actividadId: z.string().min(1),
  fecha: dia,
  hora,
});

export const serieSchema = z.object({
  actividadId: z.string().min(1),
  diaSemana: entero(0, 6),
  hora,
  semanas: entero(1, 12),
});
