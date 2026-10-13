// Actividades recurrentes: horarios semanales con vigencia, cupo y precio por clase. Los socios
// reservan clases concretas (ver modules/reservas).
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { DIA_MS, inicioDelDia } from "@/lib/periodo";
import { claveDia, horarioDe } from "@/modules/calendario/reglas";
import { notificar } from "@/modules/notificaciones/emitir";
import { actividadSchema } from "./schema";

const conHorarios = { horarios: { orderBy: [{ diaSemana: "asc" as const }, { hora: "asc" as const }] } };

export function listarActividades(clubId: string) {
  return db.actividad.findMany({
    where: { clubId },
    orderBy: { nombre: "asc" },
    include: { ...conHorarios, _count: { select: { listaEspera: true } } },
  });
}

export async function obtenerActividad(clubId: string, actividadId: string) {
  return db.actividad.findFirst({ where: { id: actividadId, clubId }, include: conHorarios });
}

export async function crearActividad(clubId: string, input: unknown) {
  const { horarios, ...data } = actividadSchema.parse(input);
  const actividad = await db.actividad.create({ data: { ...data, clubId, horarios: { create: horarios } } });
  await notificar(clubId, { tipo: "ACTIVIDAD_NUEVA", actividadId: actividad.id });
  return actividad;
}

/**
 * Edita datos y horarios. El cupo no puede quedar por debajo de las reservas de ninguna clase
 * futura. Las excepciones y reservas de clases futuras que ya no caen en un horario vigente se
 * borran (y se anulan los cargos de esas reservas). Si se sube el cupo, se avisa a la lista de
 * espera de las clases que estaban llenas y ahora tienen lugar.
 */
export async function editarActividad(clubId: string, actividadId: string, input: unknown, hoy: Date = new Date()) {
  const { horarios, ...data } = actividadSchema.parse(input);
  const desde = inicioDelDia(hoy);
  const r = await db.$transaction(async (tx) => {
    const actual = await tx.actividad.findFirst({ where: { id: actividadId, clubId }, include: { horarios: true } });
    if (!actual) throw new DomainError("Actividad no encontrada");
    const ocupacion = await tx.reserva.groupBy({
      by: ["fecha", "hora"], where: { actividadId, fecha: { gte: desde } }, _count: { _all: true },
    });
    const maximo = Math.max(0, ...ocupacion.map((o) => o._count._all));
    if (data.cupo < maximo) throw new DomainError(`El cupo no puede ser menor a las reservas de una clase (${maximo})`);
    // Participantes (antes de borrar reservas huérfanas): a ellos se les avisa del cambio.
    const participantes = await tx.reserva.findMany({
      where: { actividadId, fecha: { gte: new Date(desde.getTime() - 30 * DIA_MS) } },
      select: { socioId: true },
      distinct: ["socioId"],
    });

    await tx.horarioActividad.deleteMany({ where: { actividadId } });
    await tx.actividad.update({ where: { id: actividadId }, data: { ...data, horarios: { create: horarios } } });

    const vigencia = { fechaInicio: data.fechaInicio, fechaFin: data.fechaFin, horarios };
    const futuras = await tx.excepcionClase.findMany({ where: { actividadId, fecha: { gte: desde } } });
    const huerfanas = futuras.filter((e) => !horarioDe(vigencia, e.fecha, e.hora)).map((e) => e.id);
    if (huerfanas.length) await tx.excepcionClase.deleteMany({ where: { id: { in: huerfanas } } });

    const reservas = await tx.reserva.findMany({ where: { actividadId, fecha: { gte: desde } } });
    const sinClase = reservas.filter((x) => !horarioDe(vigencia, x.fecha, x.hora));
    for (const x of sinClase) {
      await tx.cargo.updateMany({
        where: { clubId, socioId: x.socioId, clave: `CLA:${actividadId}:${claveDia(x.fecha)}:${x.hora}`, estado: "PENDIENTE" },
        data: { estado: "ANULADO", motivoAnulacion: "La clase ya no existe" },
      });
    }
    if (sinClase.length) await tx.reserva.deleteMany({ where: { id: { in: sinClase.map((x) => x.id) } } });

    const firma = (hs: { diaSemana: number; hora: string; duracionMin: number }[]) =>
      hs.map((h) => `${h.diaSemana}|${h.hora}|${h.duracionMin}`).sort().join(",");
    const cambioAgenda =
      firma(actual.horarios) !== firma(horarios) ||
      actual.fechaInicio.getTime() !== data.fechaInicio.getTime() ||
      (actual.fechaFin?.getTime() ?? null) !== (data.fechaFin?.getTime() ?? null);

    // Clases que estaban llenas con el cupo anterior y ahora tienen lugar, con gente esperando.
    const conLugarNuevo = ocupacion.filter((o) => o._count._all >= actual.cupo && o._count._all < data.cupo);
    const liberadas = [];
    for (const o of conLugarNuevo) {
      if (await tx.listaEspera.count({ where: { actividadId, fecha: o.fecha, hora: o.hora } })) liberadas.push(o);
    }
    return {
      excepcionesBorradas: huerfanas.length, reservasBorradas: sinClase.length, cambioAgenda, liberadas,
      socioIds: participantes.map((p) => p.socioId),
    };
  });
  if (r.cambioAgenda) await notificar(clubId, { tipo: "ACTIVIDAD_EDITADA", actividadId, socioIds: r.socioIds });
  for (const o of r.liberadas) await notificar(clubId, { tipo: "LUGAR_LIBERADO", actividadId, fecha: o.fecha, hora: o.hora });
  return { excepcionesBorradas: r.excepcionesBorradas, reservasBorradas: r.reservasBorradas };
}

export async function cambiarEstadoActividad(clubId: string, actividadId: string, activa: boolean) {
  const { count } = await db.actividad.updateMany({ where: { id: actividadId, clubId }, data: { activa } });
  if (count === 0) throw new DomainError("Actividad no encontrada");
}
