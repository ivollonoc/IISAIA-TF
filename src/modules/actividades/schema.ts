// Validación de entrada del módulo actividades.
import { z } from "zod";
import { dia, entero, hora, opcional, texto } from "@/lib/validation";

const horarioSchema = z.object({
  diaSemana: entero(0, 6),
  hora,
  duracionMin: entero(15, 600).default(60),
});

/**
 * El formulario manda un renglón por horario (h_N_dia, h_N_hora, h_N_dur, con N cualquiera: los
 * renglones se agregan y quitan en el navegador). Si ya viene `horarios` como lista, se respeta.
 */
export function horariosDeFormulario(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray((input as { horarios?: unknown }).horarios)) return input;
  const form = input as Record<string, unknown>;
  const indices = Object.keys(form)
    .map((k) => /^h_(\d+)_dia$/.exec(k)?.[1])
    .filter((n): n is string => n !== undefined && form[`h_${n}_dia`] != null && form[`h_${n}_dia`] !== "")
    .sort((a, b) => Number(a) - Number(b));
  const horarios = indices.map((n) => {
    const duracion = form[`h_${n}_dur`];
    return { diaSemana: form[`h_${n}_dia`], hora: form[`h_${n}_hora`], ...(duracion ? { duracionMin: duracion } : {}) };
  });
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
      horarios: z.array(horarioSchema).min(1, "Agregá al menos un horario").max(28),
    })
    .refine((a) => new Set(a.horarios.map((h) => `${h.diaSemana}|${h.hora}`)).size === a.horarios.length, {
      message: "Hay un horario repetido",
      path: ["horarios"],
    })
    .refine((a) => !a.fechaFin || a.fechaFin >= a.fechaInicio, {
      message: "La fecha de fin no puede ser anterior al inicio",
      path: ["fechaFin"],
    }),
);

export type ActividadInput = z.infer<typeof actividadSchema>;
