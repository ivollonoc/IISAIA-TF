// Calendario del club: consultas por rango (admin y socio) y operaciones del admin.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { DIA_MS, inicioDelDia } from "@/lib/periodo";
import { armarCalendario, horarioDe, parsearDia } from "./reglas";
import { reprogramarClaseSchema, suspenderClaseSchema } from "./schema";

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

/** Verifica que (actividad, fecha, hora) sea una clase modificable y devuelve su horario. */
async function claseModificable(clubId: string, actividadId: string, fecha: Date, hora: string, hoy: Date) {
  const actividad = await db.actividad.findFirst({
    where: { id: actividadId, clubId, activa: true },
    include: { horarios: true },
  });
  if (!actividad) throw new DomainError("Actividad no encontrada");
  const horario = horarioDe(actividad, fecha, hora);
  if (!horario) throw new DomainError("Esa fecha no corresponde a una clase de la actividad");
  if (esPasada(fecha, hoy)) throw new DomainError("No se pueden modificar clases pasadas");
  return horario;
}

/** Crea la excepción; si la clase ya tenía una (UNIQUE actividad+fecha+hora), avisa que hay que restablecerla. */
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
  await claseModificable(clubId, data.actividadId, data.fecha, data.hora, hoy);
  return guardarExcepcion({
    clubId, actividadId: data.actividadId, fecha: data.fecha, hora: data.hora, tipo: "SUSPENDIDA", motivo: data.motivo,
  });
}

export async function reprogramarClase(clubId: string, input: unknown, hoy: Date = new Date()) {
  const data = reprogramarClaseSchema.parse(input);
  const horario = await claseModificable(clubId, data.actividadId, data.fecha, data.hora, hoy);
  if (esPasada(data.nuevaFecha, hoy)) throw new DomainError("La nueva fecha no puede ser pasada");
  if (data.nuevaFecha.getTime() === data.fecha.getTime() && data.nuevaHora === horario.hora) {
    throw new DomainError("Elegí una fecha u hora distinta");
  }
  return guardarExcepcion({
    clubId, actividadId: data.actividadId, fecha: data.fecha, hora: data.hora, tipo: "REPROGRAMADA",
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

/** Clave de una clase en la URL: "<actividadId>:<AAAA-MM-DD>:<HH:MM>". */
export const claveClase = (actividadId: string, fecha: string, hora: string) => `${actividadId}:${fecha}:${hora}`;

/** Clase elegida en la UI (ver claveClase); null si la clave no es una clase del club. */
export async function obtenerClase(clubId: string, clave: string) {
  const m = /^([^:]+):(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})$/.exec(clave);
  const fecha = m ? parsearDia(m[2]) : null;
  if (!m || !fecha) return null;
  const [, actividadId, , hora] = m;
  const actividad = await db.actividad.findFirst({
    where: { id: actividadId, clubId, activa: true },
    include: { horarios: true },
  });
  const horario = actividad && horarioDe(actividad, fecha, hora);
  if (!actividad || !horario) return null;
  const excepcion = await db.excepcionClase.findUnique({ where: { actividadId_fecha_hora: { actividadId, fecha, hora } } });
  return { actividad, horario, fecha, excepcion };
}
