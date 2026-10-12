// Lista de espera de actividades y eventos llenos. Anotarse no reserva nada: cuando se libera un
// lugar se avisa a todos los de la lista y se inscribe el primero que llega.
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { inicioDelDia } from "@/lib/periodo";

export type RefEspera = { actividadId: string; eventoId?: undefined } | { eventoId: string; actividadId?: undefined };

/** Verifica que el destino esté lleno y que el socio no esté inscripto. */
async function verificarLleno(clubId: string, socioId: string, ref: RefEspera, hoy: Date) {
  if (ref.actividadId) {
    const a = await db.actividad.findFirst({
      where: { id: ref.actividadId, clubId, activa: true },
      include: { _count: { select: { inscripciones: true } }, inscripciones: { where: { socioId }, select: { id: true } } },
    });
    if (!a) throw new DomainError("Actividad no encontrada");
    if (a.inscripciones.length) throw new DomainError("Ya estás inscripto");
    if (a._count.inscripciones < a.cupo) throw new DomainError("Todavía hay lugar: inscribite directamente");
    return;
  }
  const ev = await db.evento.findFirst({
    where: { id: ref.eventoId, clubId },
    include: { _count: { select: { inscripciones: true } }, inscripciones: { where: { socioId }, select: { id: true } } },
  });
  if (!ev) throw new DomainError("Evento no encontrado");
  if (!ev.conInscripcion) throw new DomainError("Este evento no admite inscripción");
  if (ev.fecha <= inicioDelDia(hoy)) throw new DomainError("El evento ya pasó");
  if (ev.inscripciones.length) throw new DomainError("Ya estás inscripto");
  if (ev.cupo === null || ev._count.inscripciones < ev.cupo) throw new DomainError("Todavía hay lugar: inscribite directamente");
}

export async function anotarEnEspera(clubId: string, socioId: string, ref: RefEspera, hoy: Date = new Date()) {
  const socio = await db.socio.findFirst({ where: { id: socioId, clubId, activo: true }, select: { id: true } });
  if (!socio) throw new DomainError("El socio no está activo");
  await verificarLleno(clubId, socioId, ref, hoy);
  const ya = await db.listaEspera.findFirst({ where: { clubId, socioId, ...ref } });
  if (ya) throw new DomainError("Ya estás en la lista de espera");
  return db.listaEspera.create({ data: { clubId, socioId, ...ref } });
}

export async function salirDeEspera(clubId: string, socioId: string, ref: RefEspera) {
  const { count } = await db.listaEspera.deleteMany({ where: { clubId, socioId, ...ref } });
  if (count === 0) throw new DomainError("No estabas en la lista de espera");
}

/** Socios en espera, en orden de llegada. */
export async function enEspera(clubId: string, ref: RefEspera): Promise<string[]> {
  const filas = await db.listaEspera.findMany({ where: { clubId, ...ref }, orderBy: { createdAt: "asc" }, select: { socioId: true } });
  return filas.map((f) => f.socioId);
}
