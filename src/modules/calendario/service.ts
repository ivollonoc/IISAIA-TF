// Calendario del club: consultas por rango (admin y socio) y operaciones del admin.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { DIA_MS, inicioDelDia } from "@/lib/periodo";
import { armarCalendario, horarioDe, parsearDia } from "./reglas";
import { eventoSchema, reprogramarClaseSchema, suspenderClaseSchema } from "./schema";

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
    db.actividad.findMany({ where: { clubId, activa: true }, include: { horarios: true } }),
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
    db.actividad.findMany({ where: { clubId, activa: true, id: { in: ids } }, include: { horarios: true } }),
    db.excepcionClase.findMany({ where: { clubId, actividadId: { in: ids }, ...excepcionesDelRango(desde, hasta) } }),
    db.evento.findMany({
      where: { clubId, fecha: { gte: desde, lte: hasta }, OR: [{ actividadId: null }, { actividadId: { in: ids } }] },
    }),
  ]);
  return armarCalendario({ actividades, excepciones, eventos, desde, hasta });
}

const esPasada = (fecha: Date, hoy: Date) => fecha.getTime() < inicioDelDia(hoy).getTime();

/** Verifica que (actividad, fecha) sea una clase modificable y devuelve el horario de ese día. */
async function claseModificable(clubId: string, actividadId: string, fecha: Date, hoy: Date) {
  const actividad = await db.actividad.findFirst({
    where: { id: actividadId, clubId, activa: true },
    include: { horarios: true },
  });
  if (!actividad) throw new DomainError("Actividad no encontrada");
  const horario = horarioDe(actividad, fecha);
  if (!horario) throw new DomainError("Esa fecha no corresponde a una clase de la actividad");
  if (esPasada(fecha, hoy)) throw new DomainError("No se pueden modificar clases pasadas");
  return horario;
}

/** Crea la excepción; si la clase ya tenía una (UNIQUE actividad+fecha), avisa que hay que restablecerla. */
async function guardarExcepcion(data: Prisma.ExcepcionClaseUncheckedCreateInput) {
  try {
    return await db.excepcionClase.create({ data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new DomainError("Esa clase ya tiene un cambio: restablecela primero");
    }
    throw e;
  }
}

export async function suspenderClase(clubId: string, input: unknown, hoy: Date = new Date()) {
  const data = suspenderClaseSchema.parse(input);
  await claseModificable(clubId, data.actividadId, data.fecha, hoy);
  return guardarExcepcion({ clubId, actividadId: data.actividadId, fecha: data.fecha, tipo: "SUSPENDIDA", motivo: data.motivo });
}

export async function reprogramarClase(clubId: string, input: unknown, hoy: Date = new Date()) {
  const data = reprogramarClaseSchema.parse(input);
  const horario = await claseModificable(clubId, data.actividadId, data.fecha, hoy);
  if (esPasada(data.nuevaFecha, hoy)) throw new DomainError("La nueva fecha no puede ser pasada");
  if (data.nuevaFecha.getTime() === data.fecha.getTime() && data.nuevaHora === horario.hora) {
    throw new DomainError("Elegí una fecha u hora distinta");
  }
  return guardarExcepcion({
    clubId, actividadId: data.actividadId, fecha: data.fecha, tipo: "REPROGRAMADA",
    nuevaFecha: data.nuevaFecha, nuevaHora: data.nuevaHora, motivo: data.motivo,
  });
}

/** Deshace una suspensión o reprogramación: la clase vuelve a la regla. */
export async function restablecerClase(clubId: string, excepcionId: string, hoy: Date = new Date()) {
  const excepcion = await db.excepcionClase.findFirst({ where: { id: excepcionId, clubId } });
  if (!excepcion) throw new DomainError("Cambio no encontrado");
  if (esPasada(excepcion.fecha, hoy)) throw new DomainError("No se pueden modificar clases pasadas");
  await db.excepcionClase.delete({ where: { id: excepcion.id } });
}

export async function crearEvento(clubId: string, input: unknown, hoy: Date = new Date()) {
  const data = eventoSchema.parse(input);
  if (esPasada(data.fecha, hoy)) throw new DomainError("La fecha no puede ser pasada");
  if (data.actividadId) {
    const actividad = await db.actividad.findFirst({ where: { id: data.actividadId, clubId }, select: { id: true } });
    if (!actividad) throw new DomainError("Actividad no encontrada");
  }
  return db.evento.create({ data: { clubId, ...data } });
}

export async function eliminarEvento(clubId: string, eventoId: string) {
  const { count } = await db.evento.deleteMany({ where: { id: eventoId, clubId } });
  if (count === 0) throw new DomainError("Evento no encontrado");
}

/** Clase elegida en la UI ("<actividadId>:<AAAA-MM-DD>"); null si la clave no es una clase del club. */
export async function obtenerClase(clubId: string, clave: string) {
  const [actividadId, textoFecha] = clave.split(":");
  const fecha = textoFecha ? parsearDia(textoFecha) : null;
  if (!actividadId || !fecha) return null;
  const actividad = await db.actividad.findFirst({
    where: { id: actividadId, clubId, activa: true },
    include: { horarios: true },
  });
  const horario = actividad && horarioDe(actividad, fecha);
  if (!actividad || !horario) return null;
  const excepcion = await db.excepcionClase.findUnique({ where: { actividadId_fecha: { actividadId, fecha } } });
  return { actividad, horario, fecha, excepcion };
}

export function obtenerEvento(clubId: string, eventoId: string) {
  return db.evento.findFirst({
    where: { id: eventoId, clubId },
    include: { actividad: { select: { nombre: true } } },
  });
}
