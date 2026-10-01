// Actividades con cupo e inscripciones de socios.
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { actividadSchema } from "@/lib/validation";

export function listarActividades(clubId: string) {
  return db.actividad.findMany({
    where: { clubId },
    orderBy: [{ diaSemana: "asc" }, { hora: "asc" }],
    include: { _count: { select: { inscripciones: true } } },
  });
}

export function crearActividad(clubId: string, input: unknown) {
  const data = actividadSchema.parse(input);
  return db.actividad.create({ data: { ...data, clubId } });
}

/**
 * Inscribe al socio respetando el cupo. La transacción serializable evita
 * que dos inscripciones simultáneas superen el cupo.
 */
export async function inscribir(clubId: string, actividadId: string, socioId: string) {
  return db.$transaction(
    async (tx) => {
      const actividad = await tx.actividad.findFirst({
        where: { id: actividadId, clubId, activa: true },
        include: { _count: { select: { inscripciones: true } } },
      });
      if (!actividad) throw new DomainError("Actividad no encontrada");

      const socio = await tx.socio.findFirst({ where: { id: socioId, clubId } });
      if (!socio?.activo) throw new DomainError("El socio no está activo");

      const yaInscripto = await tx.inscripcion.findUnique({
        where: { actividadId_socioId: { actividadId, socioId } },
      });
      if (yaInscripto) throw new DomainError("Ya estás inscripto en esta actividad");
      if (actividad._count.inscripciones >= actividad.cupo) throw new DomainError("No hay cupo disponible");

      return tx.inscripcion.create({ data: { clubId, actividadId, socioId } });
    },
    { isolationLevel: "Serializable" },
  );
}

export async function cancelarInscripcion(clubId: string, actividadId: string, socioId: string) {
  const { count } = await db.inscripcion.deleteMany({ where: { clubId, actividadId, socioId } });
  if (count === 0) throw new DomainError("No estabas inscripto");
}

/** Vista del socio: actividades del club marcando en cuáles está inscripto. */
export async function actividadesParaSocio(clubId: string, socioId: string) {
  const actividades = await db.actividad.findMany({
    where: { clubId, activa: true },
    orderBy: [{ diaSemana: "asc" }, { hora: "asc" }],
    include: {
      _count: { select: { inscripciones: true } },
      inscripciones: { where: { socioId }, select: { id: true } },
    },
  });
  return actividades.map(({ inscripciones, _count, ...a }) => ({
    ...a,
    inscriptos: _count.inscripciones,
    inscripto: inscripciones.length > 0,
  }));
}
