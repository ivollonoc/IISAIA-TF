// Validación de los avisos manuales.
import { z } from "zod";
import { opcional, texto } from "@/lib/validation";

export const avisoClubSchema = z.object({
  asunto: texto(80),
  mensaje: texto(1000),
  actividadId: opcional(64), // vacío = todo el club
});

export const avisoPlataformaSchema = z.object({
  asunto: texto(80),
  mensaje: texto(1000),
  clubId: opcional(64), // vacío = admins de todos los clubes
});
