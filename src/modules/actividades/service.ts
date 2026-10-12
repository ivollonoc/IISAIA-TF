// Actividades recurrentes (horarios semanales con vigencia), cupo e inscripciones de socios.
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { inicioDelDia } from "@/lib/periodo";
import { horarioDe } from "@/modules/calendario/reglas";
import { anularPorCancelacion, cargoPorInscripcion } from "@/modules/cuenta-corriente/cargos.service";
import { actividadSchema } from "./schema";

const conHorarios = { horarios: { orderBy: { diaSemana: "asc" as const } } };

export function listarActividades(clubId: string) {
  return db.actividad.findMany({
    where: { clubId },
    orderBy: { nombre: "asc" },
    include: { ...conHorarios, _count: { select: { inscripciones: true, listaEspera: true } } },
  });
}

export async function obtenerActividad(clubId: string, actividadId: string) {
  return db.actividad.findFirst({
    where: { id: actividadId, clubId },
    include: {
      ...conHorarios,
      inscripciones: { include: { socio: true }, orderBy: { createdAt: "asc" } },
      listaEspera: { include: { socio: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

export async function crearActividad(clubId: string, input: unknown) {
  const { horarios, ...data } = actividadSchema.parse(input);
  return db.actividad.create({ data: { ...data, clubId, horarios: { create: horarios } } });
}

/**
 * Edita datos y horarios. El cupo no puede quedar por debajo de los inscriptos. Las excepciones de
 * clases futuras que ya no caen en un horario vigente se borran (las pasadas quedan como registro).
 * El arancel nuevo aplica a los cargos que se generen desde ahora.
 */
export async function editarActividad(clubId: string, actividadId: string, input: unknown, hoy: Date = new Date()) {
  const { horarios, ...data } = actividadSchema.parse(input);
  return db.$transaction(async (tx) => {
    const actual = await tx.actividad.findFirst({
      where: { id: actividadId, clubId },
      include: { _count: { select: { inscripciones: true } } },
    });
    if (!actual) throw new DomainError("Actividad no encontrada");
    if (data.cupo < actual._count.inscripciones) {
      throw new DomainError(`El cupo no puede ser menor a los inscriptos (${actual._count.inscripciones})`);
    }

    await tx.horarioActividad.deleteMany({ where: { actividadId } });
    await tx.actividad.update({ where: { id: actividadId }, data: { ...data, horarios: { create: horarios } } });

    const vigencia = { fechaInicio: data.fechaInicio, fechaFin: data.fechaFin, horarios: horarios };
    const futuras = await tx.excepcionClase.findMany({ where: { actividadId, fecha: { gte: inicioDelDia(hoy) } } });
    const huerfanas = futuras.filter((e) => !horarioDe(vigencia, e.fecha, e.hora)).map((e) => e.id);
    if (huerfanas.length) await tx.excepcionClase.deleteMany({ where: { id: { in: huerfanas } } });
    return { excepcionesBorradas: huerfanas.length };
  });
}

export async function cambiarEstadoActividad(clubId: string, actividadId: string, activa: boolean) {
  const { count } = await db.actividad.updateMany({ where: { id: actividadId, clubId }, data: { activa } });
  if (count === 0) throw new DomainError("Actividad no encontrada");
}

/**
 * Inscribe al socio respetando el cupo y la vigencia y, si la actividad es paga y el período ya se
 * generó, le carga el arancel del mes. Si estaba en la lista de espera, sale de ella. La
 * transacción serializable evita que dos inscripciones simultáneas superen el cupo.
 */
export async function inscribir(clubId: string, actividadId: string, socioId: string, hoy: Date = new Date()) {
  return db.$transaction(
    async (tx) => {
      const actividad = await tx.actividad.findFirst({
        where: { id: actividadId, clubId, activa: true },
        include: { _count: { select: { inscripciones: true } } },
      });
      if (!actividad) throw new DomainError("Actividad no encontrada");
      if (actividad.fechaFin && actividad.fechaFin < inicioDelDia(hoy)) throw new DomainError("La actividad ya finalizó");

      const socio = await tx.socio.findFirst({ where: { id: socioId, clubId } });
      if (!socio?.activo) throw new DomainError("El socio no está activo");

      const yaInscripto = await tx.inscripcion.findUnique({
        where: { actividadId_socioId: { actividadId, socioId } },
      });
      if (yaInscripto) throw new DomainError("Ya estás inscripto en esta actividad");
      if (actividad._count.inscripciones >= actividad.cupo) throw new DomainError("No hay cupo disponible");

      const inscripcion = await tx.inscripcion.create({ data: { clubId, actividadId, socioId } });
      await tx.listaEspera.deleteMany({ where: { clubId, socioId, actividadId } });
      const cargo = await cargoPorInscripcion(tx, clubId, socioId, actividad, hoy);
      return { ...inscripcion, cargo: cargo && { id: cargo.id, monto: cargo.monto } };
    },
    { isolationLevel: "Serializable" },
  );
}

/** Cancela la inscripción y anula el arancel pendiente. `liberado`: la actividad estaba llena. */
export async function cancelarInscripcion(clubId: string, actividadId: string, socioId: string, hoy: Date = new Date()) {
  return db.$transaction(async (tx) => {
    const actividad = await tx.actividad.findFirst({
      where: { id: actividadId, clubId },
      select: { cupo: true, _count: { select: { inscripciones: true } } },
    });
    const { count } = await tx.inscripcion.deleteMany({ where: { clubId, actividadId, socioId } });
    if (count === 0 || !actividad) throw new DomainError("No estabas inscripto");
    await anularPorCancelacion(tx, clubId, socioId, actividadId, hoy);
    return { liberado: actividad._count.inscripciones >= actividad.cupo };
  });
}

/** Vista del socio: actividades activas y vigentes, marcando inscripción y lista de espera. */
export async function actividadesParaSocio(clubId: string, socioId: string, hoy: Date = new Date()) {
  const actividades = await db.actividad.findMany({
    where: { clubId, activa: true, OR: [{ fechaFin: null }, { fechaFin: { gte: inicioDelDia(hoy) } }] },
    orderBy: { nombre: "asc" },
    include: {
      ...conHorarios,
      _count: { select: { inscripciones: true } },
      inscripciones: { where: { socioId }, select: { id: true } },
      listaEspera: { where: { socioId }, select: { id: true } },
    },
  });
  return actividades.map(({ inscripciones, listaEspera, _count, ...a }) => ({
    ...a,
    inscriptos: _count.inscripciones,
    inscripto: inscripciones.length > 0,
    enEspera: listaEspera.length > 0,
  }));
}
