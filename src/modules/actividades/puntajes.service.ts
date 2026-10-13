// Puntajes de actividades: el socio que ya fue a alguna clase la puntúa de 0,5 a 5 estrellas (se
// guarda en medias estrellas para no usar decimales) con un comentario opcional.
import { z } from "zod";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { inicioDelDia } from "@/lib/periodo";
import { opcional } from "@/lib/validation";

const puntajeSchema = z.object({
  actividadId: z.string().min(1),
  estrellas: z.coerce
    .number()
    .min(0.5, "De 0,5 a 5 estrellas")
    .max(5, "De 0,5 a 5 estrellas")
    .refine((n) => Number.isInteger(n * 2), "En pasos de media estrella"),
  comentario: opcional(280),
});

export async function puntuar(clubId: string, socioId: string, input: unknown, hoy: Date = new Date()) {
  const { actividadId, estrellas, comentario } = puntajeSchema.parse(input);
  const fue = await db.reserva.findFirst({
    where: { clubId, actividadId, socioId, fecha: { lte: inicioDelDia(hoy) } },
    select: { id: true },
  });
  if (!fue) throw new DomainError("Podés puntuar las actividades a las que ya fuiste");
  const medias = Math.round(estrellas * 2);
  return db.puntaje.upsert({
    where: { actividadId_socioId: { actividadId, socioId } },
    create: { clubId, actividadId, socioId, medias, comentario },
    update: { medias, comentario },
  });
}

const enEstrellas = (medias: number) => medias / 2;
const promedio = (medias: number[]) => (medias.length ? Math.round((medias.reduce((s, m) => s + m, 0) / medias.length / 2) * 10) / 10 : 0);

/** Promedio (en estrellas, un decimal), cantidad de votos y comentarios de una actividad. */
export async function puntajesDeActividad(clubId: string, actividadId: string) {
  const puntajes = await db.puntaje.findMany({
    where: { clubId, actividadId },
    orderBy: { updatedAt: "desc" },
    include: { socio: { select: { nombre: true } } },
  });
  return {
    promedio: promedio(puntajes.map((p) => p.medias)),
    votos: puntajes.length,
    comentarios: puntajes
      .filter((p) => p.comentario)
      .map((p) => ({ socio: p.socio.nombre, estrellas: enEstrellas(p.medias), comentario: p.comentario!, fecha: p.updatedAt })),
  };
}

/** Para la vista del socio: su puntaje de cada actividad y en cuáles ya puede puntuar. */
export async function puntajesDelSocio(clubId: string, socioId: string, hoy: Date = new Date()) {
  const [mios, fue] = await Promise.all([
    db.puntaje.findMany({ where: { clubId, socioId } }),
    db.reserva.findMany({
      where: { clubId, socioId, fecha: { lte: inicioDelDia(hoy) } },
      select: { actividadId: true },
      distinct: ["actividadId"],
    }),
  ]);
  return {
    puntajes: new Map(mios.map((p) => [p.actividadId, { estrellas: enEstrellas(p.medias), comentario: p.comentario }])),
    puedePuntuar: new Set(fue.map((r) => r.actividadId)),
  };
}

export { promedio as promedioEstrellas };
