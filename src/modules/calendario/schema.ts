// Validación de entrada del módulo calendario. Las fechas llegan como "AAAA-MM-DD" (input date).
import { z } from "zod";
import { dia, hora, opcional, texto } from "@/lib/validation";

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
