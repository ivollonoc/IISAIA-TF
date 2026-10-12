// Validación de entrada del módulo actividades.
import { z } from "zod";
import { dia, entero, hora, opcional, texto } from "@/lib/validation";

const horarioSchema = z.object({
  diaSemana: entero(0, 6),
  hora,
  duracionMin: entero(15, 600).default(60),
});

/**
 * El formulario manda un checkbox por día (dia_0 … dia_6) con su hora y duración (hora_N,
 * duracion_N); solo cuentan los días marcados. Si ya viene `horarios` como lista, se respeta.
 */
export function horariosDeFormulario(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray((input as { horarios?: unknown }).horarios)) return input;
  const form = input as Record<string, unknown>;
  const horarios = [];
  for (let d = 0; d <= 6; d++) {
    if (form[`dia_${d}`] !== "on") continue;
    const duracion = form[`duracion_${d}`];
    horarios.push({ diaSemana: d, hora: form[`hora_${d}`], ...(duracion ? { duracionMin: duracion } : {}) });
  }
  return { ...form, horarios };
}

export const actividadSchema = z.preprocess(
  horariosDeFormulario,
  z
    .object({
      nombre: texto(60),
      descripcion: opcional(500),
      cupo: entero(1, 500),
      arancel: entero(0, 10_000_000).default(0),
      fechaInicio: dia,
      fechaFin: z.union([z.literal(""), z.null(), dia]).optional().transform((v) => v || null),
      horarios: z.array(horarioSchema).min(1, "Elegí al menos un día").max(7),
    })
    .refine((a) => new Set(a.horarios.map((h) => h.diaSemana)).size === a.horarios.length, {
      message: "Un solo horario por día",
      path: ["horarios"],
    })
    .refine((a) => !a.fechaFin || a.fechaFin >= a.fechaInicio, {
      message: "La fecha de fin no puede ser anterior al inicio",
      path: ["fechaFin"],
    }),
);

export type ActividadInput = z.infer<typeof actividadSchema>;
