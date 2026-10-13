// Reservas de clases: cada socio reserva clases concretas de una actividad (cupo por clase).
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { formatDiaCorto } from "@/lib/format";
import { DIA_MS, inicioDelDia, periodoActual } from "@/lib/periodo";
import { claveDia, clasesEnRango, horaFin, horarioDe } from "@/modules/calendario/reglas";
import { notificar } from "@/modules/notificaciones/emitir";
import { claseSchema, serieSchema } from "./schema";

const HORA_MS = 60 * 60 * 1000;

/** Instante de inicio de una clase (día a medianoche UTC + hora de Argentina, UTC-3). */
export function inicioDeClase(fecha: Date, hora: string): Date {
  const [h, m] = hora.split(":").map(Number);
  return new Date(fecha.getTime() + (h + 3) * HORA_MS + m * 60_000);
}

export const claveCargoClase = (actividadId: string, fecha: Date, hora: string) => `CLA:${actividadId}:${claveDia(fecha)}:${hora}`;

type Tx = Prisma.TransactionClient;

/**
 * Verifica que la clase exista y se pueda reservar o cancelar: horario de la actividad dentro de
 * su vigencia, no suspendida y todavía sin empezar (para una reprogramada cuenta su nuevo horario).
 */
export async function claseVigente(tx: Tx, clubId: string, actividadId: string, fecha: Date, hora: string, hoy: Date) {
  const actividad = await tx.actividad.findFirst({ where: { id: actividadId, clubId, activa: true }, include: { horarios: true } });
  if (!actividad) throw new DomainError("Actividad no encontrada");
  if (!horarioDe(actividad, fecha, hora)) throw new DomainError("Esa clase no existe");
  const excepcion = await tx.excepcionClase.findUnique({ where: { actividadId_fecha_hora: { actividadId, fecha, hora } } });
  if (excepcion?.tipo === "SUSPENDIDA") throw new DomainError("La clase está suspendida");
  const inicio = excepcion?.tipo === "REPROGRAMADA" ? inicioDeClase(excepcion.nuevaFecha!, excepcion.nuevaHora!) : inicioDeClase(fecha, hora);
  if (inicio.getTime() <= hoy.getTime()) throw new DomainError("La clase ya empezó");
  return actividad;
}

/** Cargo de una clase paga: nuevo, o reactivado si se había anulado por una cancelación. */
async function cargoPorClase(
  tx: Tx,
  clubId: string,
  socioId: string,
  actividad: { id: string; nombre: string; precioClase: number },
  fecha: Date,
  hora: string,
  hoy: Date,
) {
  if (actividad.precioClase <= 0) return null;
  const clave = claveCargoClase(actividad.id, fecha, hora);
  const existente = await tx.cargo.findFirst({ where: { clubId, socioId, clave } });
  if (existente?.estado === "PAGADO" || existente?.estado === "PENDIENTE") return null;
  if (existente) {
    return tx.cargo.update({ where: { id: existente.id }, data: { estado: "PENDIENTE", monto: actividad.precioClase, motivoAnulacion: null } });
  }
  return tx.cargo.create({
    data: {
      clubId, socioId, concepto: "CLASE", actividadId: actividad.id, clave,
      descripcion: `${actividad.nombre} ${formatDiaCorto(fecha)} ${hora}`,
      periodo: periodoActual(hoy), monto: actividad.precioClase, vencimiento: fecha,
    },
  });
}

/** Reserva una clase respetando su cupo (transacción serializable: dos reservas al último lugar no entran). */
export async function reservar(clubId: string, socioId: string, input: unknown, hoy: Date = new Date()) {
  const { actividadId, fecha, hora } = claseSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      const actividad = await claseVigente(tx, clubId, actividadId, fecha, hora, hoy);
      const socio = await tx.socio.findFirst({ where: { id: socioId, clubId } });
      if (!socio?.activo) throw new DomainError("El socio no está activo");
      const ya = await tx.reserva.findUnique({ where: { actividadId_fecha_hora_socioId: { actividadId, fecha, hora, socioId } } });
      if (ya) throw new DomainError("Ya reservaste esta clase");
      const ocupados = await tx.reserva.count({ where: { actividadId, fecha, hora } });
      if (ocupados >= actividad.cupo) throw new DomainError("No hay lugar en esta clase");

      await tx.reserva.create({ data: { clubId, actividadId, socioId, fecha, hora } });
      await tx.listaEspera.deleteMany({ where: { clubId, socioId, actividadId, fecha, hora } });
      const cargo = await cargoPorClase(tx, clubId, socioId, actividad, fecha, hora, hoy);
      return { cargo: cargo && { id: cargo.id, monto: cargo.monto } };
    },
    { isolationLevel: "Serializable" },
  );
}

/**
 * Reserva las próximas `semanas` clases de un horario (desde hoy). Las que no tienen lugar se
 * cuentan como completas; las suspendidas, ya reservadas o ya empezadas, como otras.
 */
export async function reservarSerie(clubId: string, socioId: string, input: unknown, hoy: Date = new Date()) {
  const { actividadId, diaSemana, hora, semanas } = serieSchema.parse(input);
  const actividad = await db.actividad.findFirst({ where: { id: actividadId, clubId, activa: true }, include: { horarios: true } });
  if (!actividad) throw new DomainError("Actividad no encontrada");
  const horario = actividad.horarios.find((h) => h.diaSemana === diaSemana && h.hora === hora);
  if (!horario) throw new DomainError("Esa actividad no tiene ese horario");

  const desde = inicioDelDia(hoy);
  const fechas = clasesEnRango({ ...actividad, horarios: [horario] }, desde, new Date(desde.getTime() + (semanas * 7 - 1) * DIA_MS)).map(
    (c) => c.fecha,
  );
  const r = { reservadas: 0, completas: 0, otras: 0 };
  for (const fecha of fechas) {
    try {
      await reservar(clubId, socioId, { actividadId, fecha: claveDia(fecha), hora }, hoy);
      r.reservadas++;
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
      if (e.message === "No hay lugar en esta clase") r.completas++;
      else r.otras++;
    }
  }
  return r;
}

/** Cancela una reserva antes de que empiece la clase; si estaba llena, avisa a su lista de espera. */
export async function cancelarReserva(clubId: string, socioId: string, input: unknown, hoy: Date = new Date()) {
  const { actividadId, fecha, hora } = claseSchema.parse(input);
  const liberado = await db.$transaction(async (tx) => {
    const reserva = await tx.reserva.findFirst({ where: { clubId, actividadId, fecha, hora, socioId } });
    if (!reserva) throw new DomainError("No tenías reservada esta clase");
    const actividad = await claseVigente(tx, clubId, actividadId, fecha, hora, hoy);
    const ocupados = await tx.reserva.count({ where: { actividadId, fecha, hora } });
    await tx.reserva.delete({ where: { id: reserva.id } });
    await tx.cargo.updateMany({
      where: { clubId, socioId, clave: claveCargoClase(actividadId, fecha, hora), estado: "PENDIENTE" },
      data: { estado: "ANULADO", motivoAnulacion: "Reserva cancelada" },
    });
    return ocupados >= actividad.cupo;
  });
  if (liberado) await notificar(clubId, { tipo: "LUGAR_LIBERADO", actividadId, fecha, hora });
}

/** Socios que reservaron una clase (vista del admin). */
export function reservasDeClase(clubId: string, actividadId: string, fecha: Date, hora: string) {
  return db.reserva.findMany({
    where: { clubId, actividadId, fecha, hora },
    orderBy: { createdAt: "asc" },
    include: { socio: { select: { id: true, nombre: true, apellido: true, nroSocio: true } } },
  });
}

export type EstadoClaseSocio = "NORMAL" | "SUSPENDIDA" | "REPROGRAMADA";

/**
 * Vista del socio: actividades activas y vigentes con sus clases desde hoy hasta `dias` días
 * después (sin las que ya empezaron), con lugares, si las reservó y si está en espera.
 */
export async function clasesParaSocio(clubId: string, socioId: string, hoy: Date = new Date(), dias = 14) {
  const desde = inicioDelDia(hoy);
  const hasta = new Date(desde.getTime() + dias * DIA_MS);
  const actividades = await db.actividad.findMany({
    where: { clubId, activa: true, OR: [{ fechaFin: null }, { fechaFin: { gte: desde } }] },
    orderBy: { nombre: "asc" },
    include: { horarios: { orderBy: [{ diaSemana: "asc" }, { hora: "asc" }] } },
  });
  const ids = actividades.map((a) => a.id);
  const rango = { gte: desde, lte: hasta };
  const [conteos, mias, esperas, excepciones] = await Promise.all([
    db.reserva.groupBy({ by: ["actividadId", "fecha", "hora"], where: { clubId, actividadId: { in: ids }, fecha: rango }, _count: { _all: true } }),
    db.reserva.findMany({ where: { clubId, socioId, fecha: rango }, select: { actividadId: true, fecha: true, hora: true } }),
    db.listaEspera.findMany({ where: { clubId, socioId, fecha: rango }, select: { actividadId: true, fecha: true, hora: true } }),
    db.excepcionClase.findMany({ where: { clubId, actividadId: { in: ids }, fecha: rango } }),
  ]);
  const k = (actividadId: string | null, fecha: Date | null, hora: string | null) => `${actividadId}|${fecha && claveDia(fecha)}|${hora}`;
  const ocupados = new Map(conteos.map((c) => [k(c.actividadId, c.fecha, c.hora), c._count._all]));
  const reservadas = new Set(mias.map((r) => k(r.actividadId, r.fecha, r.hora)));
  const enEspera = new Set(esperas.map((r) => k(r.actividadId, r.fecha, r.hora)));
  const cambios = new Map(excepciones.map((e) => [k(e.actividadId, e.fecha, e.hora), e]));

  return actividades.map((a) => ({
    ...a,
    clases: clasesEnRango(a, desde, hasta)
      .map(({ fecha, horario }) => {
        const clave = k(a.id, fecha, horario.hora);
        const exc = cambios.get(clave);
        const estado: EstadoClaseSocio = exc ? exc.tipo : "NORMAL";
        const destino = exc?.tipo === "REPROGRAMADA" ? { fecha: exc.nuevaFecha!, hora: exc.nuevaHora! } : null;
        return {
          fecha, hora: horario.hora, horaFin: horaFin(horario.hora, horario.duracionMin), estado, destino,
          motivo: exc?.motivo ?? null,
          inicio: destino ? inicioDeClase(destino.fecha, destino.hora) : inicioDeClase(fecha, horario.hora),
          reservas: ocupados.get(clave) ?? 0, reservada: reservadas.has(clave), enEspera: enEspera.has(clave),
        };
      })
      .filter((c) => c.inicio.getTime() > hoy.getTime()),
  }));
}

/** Socios en la lista de espera de una clase (vista del admin), en orden de llegada. */
export function esperaDeClase(clubId: string, actividadId: string, fecha: Date, hora: string) {
  return db.listaEspera.findMany({
    where: { clubId, actividadId, fecha, hora },
    orderBy: { createdAt: "asc" },
    include: { socio: { select: { id: true, nombre: true, apellido: true, nroSocio: true } } },
  });
}
