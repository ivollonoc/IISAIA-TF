// Datos mínimos para armar cada caso. Escriben directo con Prisma (no pasan por los
// servicios bajo test) y cada llamada genera valores únicos.
import { db } from "@/lib/db";

let seq = 0;
const siguiente = () => ++seq;

export function crearClub(over: { nombre?: string; slug?: string; diaVencimiento?: number } = {}) {
  const n = siguiente();
  return db.club.create({ data: { nombre: `Club ${n}`, slug: `club-${n}`, ...over } });
}

export function crearTipo(clubId: string, over: { nombre?: string; cuotaMensual?: number } = {}) {
  const n = siguiente();
  return db.tipoSocio.create({ data: { clubId, nombre: `Tipo ${n}`, cuotaMensual: 10000, ...over } });
}

export async function crearSocio(
  clubId: string,
  over: {
    nombre?: string;
    apellido?: string;
    dni?: string;
    email?: string | null;
    tipoSocioId?: string;
    activo?: boolean;
    nroSocio?: number;
  } = {},
) {
  const n = siguiente();
  const tipoSocioId = over.tipoSocioId ?? (await crearTipo(clubId)).id;
  return db.socio.create({
    data: {
      clubId,
      nroSocio: n,
      nombre: "Socio",
      apellido: `N${n}`,
      dni: String(20_000_000 + n),
      email: null,
      activo: true,
      ...over,
      tipoSocioId,
    },
  });
}

export function crearActividad(
  clubId: string,
  over: {
    nombre?: string;
    diaSemana?: number;
    hora?: string;
    cupo?: number;
    activa?: boolean;
    arancel?: number;
    duracionMin?: number;
    createdAt?: Date;
  } = {},
) {
  const n = siguiente();
  return db.actividad.create({
    data: { clubId, nombre: `Actividad ${n}`, diaSemana: 1, hora: "18:00", cupo: 10, activa: true, ...over },
  });
}

export function inscribirDirecto(clubId: string, actividadId: string, socioId: string) {
  return db.inscripcion.create({ data: { clubId, actividadId, socioId } });
}

export function crearPagoDirecto(
  clubId: string,
  socioId: string,
  over: { monto?: number; medio?: "EFECTIVO" | "TRANSFERENCIA" | "ONLINE" | "OTRO"; fecha?: Date } = {},
) {
  return db.pago.create({ data: { clubId, socioId, monto: 10000, medio: "EFECTIVO", ...over } });
}

export function crearCargo(
  clubId: string,
  socioId: string,
  over: {
    concepto?: "CUOTA" | "ACTIVIDAD";
    actividadId?: string | null;
    clave?: string;
    descripcion?: string;
    periodo?: string;
    monto?: number;
    vencimiento?: Date;
    estado?: "PENDIENTE" | "PAGADO" | "ANULADO";
    pagoId?: string | null;
    createdAt?: Date;
  } = {},
) {
  const n = siguiente();
  return db.cargo.create({
    data: {
      clubId,
      socioId,
      concepto: "CUOTA",
      clave: `X:${n}`,
      descripcion: `Cargo ${n}`,
      periodo: "2026-10",
      monto: 10000,
      vencimiento: new Date(Date.UTC(2026, 9, 10)),
      ...over,
    },
  });
}

export function crearExcepcion(
  clubId: string,
  actividadId: string,
  over: {
    fecha?: Date;
    tipo?: "SUSPENDIDA" | "REPROGRAMADA";
    nuevaFecha?: Date | null;
    nuevaHora?: string | null;
    motivo?: string;
  } = {},
) {
  return db.excepcionClase.create({
    data: { clubId, actividadId, fecha: new Date(Date.UTC(2026, 9, 21)), tipo: "SUSPENDIDA", motivo: "Feriado", ...over },
  });
}

export function crearEvento(
  clubId: string,
  over: { titulo?: string; fecha?: Date; hora?: string; lugar?: string | null; descripcion?: string | null; actividadId?: string | null } = {},
) {
  const n = siguiente();
  return db.evento.create({
    data: { clubId, titulo: `Evento ${n}`, fecha: new Date(Date.UTC(2026, 9, 20)), hora: "20:00", ...over },
  });
}
