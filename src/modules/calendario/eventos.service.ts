// Eventos puntuales del club: alta y baja del admin, e inscripción opcional de los socios con
// cupo (null = sin límite) y precio (cargo único en la cuenta corriente).
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { DIA_MS, inicioDelDia } from "@/lib/periodo";
import { anularCargosEvento, cargoPorEvento } from "@/modules/cuenta-corriente/cargos.service";
import { notificar } from "@/modules/notificaciones/emitir";
import { eventoSchema } from "./schema";

const esPasada = (fecha: Date, hoy: Date) => fecha.getTime() < inicioDelDia(hoy).getTime();
/** Desde el día del evento ya no se puede inscribir ni cancelar. */
const yaEmpezo = (fecha: Date, hoy: Date) => fecha.getTime() <= inicioDelDia(hoy).getTime();

export async function crearEvento(clubId: string, input: unknown, hoy: Date = new Date()) {
  const data = eventoSchema.parse(input);
  if (esPasada(data.fecha, hoy)) throw new DomainError("La fecha no puede ser pasada");
  if (data.actividadId) {
    const actividad = await db.actividad.findFirst({ where: { id: data.actividadId, clubId }, select: { id: true } });
    if (!actividad) throw new DomainError("Actividad no encontrada");
  }
  const evento = await db.evento.create({ data: { clubId, ...data } });
  await notificar(clubId, { tipo: "EVENTO_NUEVO", eventoId: evento.id });
  return evento;
}

/** Elimina el evento; los cargos pendientes de sus inscriptos se anulan (lo pagado queda). */
export async function eliminarEvento(clubId: string, eventoId: string) {
  const evento = await db.$transaction(async (tx) => {
    const e = await tx.evento.findFirst({ where: { id: eventoId, clubId } });
    if (!e) throw new DomainError("Evento no encontrado");
    await anularCargosEvento(tx, clubId, eventoId, "Evento cancelado");
    await tx.evento.delete({ where: { id: eventoId } });
    return e;
  });
  await notificar(clubId, {
    tipo: "EVENTO_CANCELADO", titulo: evento.titulo, fecha: evento.fecha, hora: evento.hora, actividadId: evento.actividadId,
  });
}

/** Eventos del club desde hoy, con cantidad de inscriptos y en espera (vista Lista del admin). */
export function proximosEventosClub(clubId: string, hoy: Date = new Date()) {
  return db.evento.findMany({
    where: { clubId, fecha: { gte: inicioDelDia(hoy) } },
    orderBy: [{ fecha: "asc" }, { hora: "asc" }],
    include: { actividad: { select: { nombre: true } }, _count: { select: { inscripciones: true, listaEspera: true } } },
  });
}

export function obtenerEvento(clubId: string, eventoId: string) {
  return db.evento.findFirst({
    where: { id: eventoId, clubId },
    include: {
      actividad: { select: { nombre: true } },
      inscripciones: { include: { socio: true }, orderBy: { createdAt: "asc" } },
      listaEspera: { include: { socio: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

/**
 * Condición de los eventos que ve un socio: los de todo el club y los de las actividades en las
 * que participa (alguna reserva desde hace 30 días en adelante).
 */
async function visiblesPara(clubId: string, socioId: string, hoy: Date = new Date()) {
  const participa = await db.reserva.findMany({
    where: { clubId, socioId, fecha: { gte: new Date(inicioDelDia(hoy).getTime() - 30 * DIA_MS) } },
    select: { actividadId: true },
    distinct: ["actividadId"],
  });
  return { OR: [{ actividadId: null }, { actividadId: { in: participa.map((r) => r.actividadId) } }] };
}

export async function inscribirEvento(clubId: string, eventoId: string, socioId: string, hoy: Date = new Date()) {
  const visibles = await visiblesPara(clubId, socioId, hoy);
  return db.$transaction(
    async (tx) => {
      const evento = await tx.evento.findFirst({
        where: { id: eventoId, clubId, ...visibles },
        include: { _count: { select: { inscripciones: true } } },
      });
      if (!evento) throw new DomainError("Evento no encontrado");
      if (!evento.conInscripcion) throw new DomainError("Este evento no admite inscripción");
      if (yaEmpezo(evento.fecha, hoy)) throw new DomainError("El evento ya pasó");

      const socio = await tx.socio.findFirst({ where: { id: socioId, clubId } });
      if (!socio?.activo) throw new DomainError("El socio no está activo");

      const ya = await tx.inscripcionEvento.findUnique({ where: { eventoId_socioId: { eventoId, socioId } } });
      if (ya) throw new DomainError("Ya estás inscripto en este evento");
      if (evento.cupo !== null && evento._count.inscripciones >= evento.cupo) throw new DomainError("No hay cupo disponible");

      await tx.inscripcionEvento.create({ data: { clubId, eventoId, socioId } });
      await tx.listaEspera.deleteMany({ where: { clubId, socioId, eventoId } });
      const cargo = await cargoPorEvento(tx, clubId, socioId, evento, hoy);
      return { cargo: cargo && { id: cargo.id, monto: cargo.monto } };
    },
    { isolationLevel: "Serializable" },
  );
}

/** Cancela la inscripción y anula el cargo pendiente. `liberado`: el evento tenía cupo y estaba lleno. */
export async function cancelarInscripcionEvento(clubId: string, eventoId: string, socioId: string, hoy: Date = new Date()) {
  const r = await db.$transaction(async (tx) => {
    const evento = await tx.evento.findFirst({
      where: { id: eventoId, clubId },
      include: { _count: { select: { inscripciones: true } } },
    });
    const inscripcion = evento && (await tx.inscripcionEvento.findUnique({ where: { eventoId_socioId: { eventoId, socioId } } }));
    if (!evento || !inscripcion) throw new DomainError("No estabas inscripto");
    if (yaEmpezo(evento.fecha, hoy)) throw new DomainError("El evento ya pasó");
    await tx.inscripcionEvento.delete({ where: { id: inscripcion.id } });
    await anularCargosEvento(tx, clubId, eventoId, "Baja del evento", socioId);
    return { liberado: evento.cupo !== null && evento._count.inscripciones >= evento.cupo };
  });
  if (r.liberado) await notificar(clubId, { tipo: "LUGAR_LIBERADO", eventoId });
  return r;
}

/** Próximos eventos que le corresponden al socio, marcando inscripción y lista de espera. */
export async function eventosParaSocio(clubId: string, socioId: string, hoy: Date = new Date()) {
  const eventos = await db.evento.findMany({
    where: { clubId, fecha: { gte: inicioDelDia(hoy) }, ...(await visiblesPara(clubId, socioId, hoy)) },
    orderBy: [{ fecha: "asc" }, { hora: "asc" }],
    include: {
      actividad: { select: { nombre: true } },
      _count: { select: { inscripciones: true } },
      inscripciones: { where: { socioId }, select: { id: true } },
      listaEspera: { where: { socioId }, select: { id: true } },
    },
  });
  return eventos.map(({ inscripciones, listaEspera, _count, ...e }) => ({
    ...e,
    inscriptos: _count.inscripciones,
    inscripto: inscripciones.length > 0,
    enEspera: listaEspera.length > 0,
  }));
}
