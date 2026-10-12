// Validación de entrada del módulo calendario. Las fechas llegan como "AAAA-MM-DD" (input date).
import { z } from "zod";
import { casilla, dia, entero, hora, opcional, texto } from "@/lib/validation";

export const suspenderClaseSchema = z.object({
  actividadId: z.string().min(1),
  fecha: dia,
  motivo: texto(200),
});

export const reprogramarClaseSchema = suspenderClaseSchema.extend({
  nuevaFecha: dia,
  nuevaHora: hora,
});

/** Sin inscripción, el cupo y el precio no aplican (null y 0). Con inscripción, cupo vacío = sin límite. */
export const eventoSchema = z
  .object({
    titulo: texto(80),
    fecha: dia,
    hora,
    duracionMin: entero(15, 600).default(60),
    lugar: opcional(80),
    descripcion: opcional(500),
    actividadId: opcional(64),
    conInscripcion: casilla,
    cupo: z.union([z.literal(""), z.null(), entero(1, 5000)]).optional().transform((v) => (v === "" ? null : v ?? null)),
    precio: z.union([z.literal(""), entero(0, 10_000_000)]).optional().transform((v) => (v === "" ? 0 : v ?? 0)),
  })
  .transform((e) => (e.conInscripcion ? e : { ...e, cupo: null, precio: 0 }));
