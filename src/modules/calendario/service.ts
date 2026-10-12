// Calendario del club: consultas por rango (admin y socio) y operaciones del admin.
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { DIA_MS } from "@/lib/periodo";
import { armarCalendario } from "./reglas";

export const MAX_DIAS_RANGO = 42;

function validarRango(desde: Date, hasta: Date) {
  const dias = (hasta.getTime() - desde.getTime()) / DIA_MS + 1;
  if (dias < 1) throw new DomainError("Rango de fechas inválido");
  if (dias > MAX_DIAS_RANGO) throw new DomainError("El rango máximo es de 6 semanas");
}

const excepcionesDelRango = (desde: Date, hasta: Date) => ({
  OR: [{ fecha: { gte: desde, lte: hasta } }, { nuevaFecha: { gte: desde, lte: hasta } }],
});

/** Calendario del admin: todas las actividades activas y todos los eventos del club. */
export async function calendarioClub(clubId: string, desde: Date, hasta: Date) {
  validarRango(desde, hasta);
  const [actividades, excepciones, eventos] = await Promise.all([
    db.actividad.findMany({ where: { clubId, activa: true } }),
    db.excepcionClase.findMany({ where: { clubId, ...excepcionesDelRango(desde, hasta) } }),
    db.evento.findMany({ where: { clubId, fecha: { gte: desde, lte: hasta } } }),
  ]);
  return armarCalendario({ actividades, excepciones, eventos, desde, hasta });
}

/** Calendario del socio: sus actividades y los eventos del club o de esas actividades. */
export async function calendarioSocio(clubId: string, socioId: string, desde: Date, hasta: Date) {
  validarRango(desde, hasta);
  const inscripciones = await db.inscripcion.findMany({ where: { clubId, socioId }, select: { actividadId: true } });
  const ids = inscripciones.map((i) => i.actividadId);
  const [actividades, excepciones, eventos] = await Promise.all([
    db.actividad.findMany({ where: { clubId, activa: true, id: { in: ids } } }),
    db.excepcionClase.findMany({ where: { clubId, actividadId: { in: ids }, ...excepcionesDelRango(desde, hasta) } }),
    db.evento.findMany({
      where: { clubId, fecha: { gte: desde, lte: hasta }, OR: [{ actividadId: null }, { actividadId: { in: ids } }] },
    }),
  ]);
  return armarCalendario({ actividades, excepciones, eventos, desde, hasta });
}
