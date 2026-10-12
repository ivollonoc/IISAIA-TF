// Datos mínimos para armar cada caso. Escriben directo con Prisma (no pasan por los
// servicios bajo test) y cada llamada genera valores únicos.
import { db } from "@/lib/db";

let seq = 0;
const siguiente = () => ++seq;

export function crearClub(
  over: { nombre?: string; slug?: string; diaVencimiento?: number; canales?: ("IN_APP" | "EMAIL" | "SMS")[] } = {},
) {
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
    telefono?: string | null;
    usuarioId?: string | null;
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

export type HorarioFactory = { diaSemana: number; hora: string; duracionMin?: number };

/** Por defecto: un horario los lunes a las 18:00 (60 min), vigente desde el 1/1/2026 y sin fin. */
export function crearActividad(
  clubId: string,
  over: {
    nombre?: string;
    horarios?: HorarioFactory[];
    cupo?: number;
    activa?: boolean;
    arancel?: number;
    fechaInicio?: Date;
    fechaFin?: Date | null;
    createdAt?: Date;
  } = {},
) {
  const n = siguiente();
  const { horarios = [{ diaSemana: 1, hora: "18:00" }], ...resto } = over;
  return db.actividad.create({
    data: {
      clubId, nombre: `Actividad ${n}`, cupo: 10, activa: true, fechaInicio: new Date(Date.UTC(2026, 0, 1)), ...resto,
      horarios: { create: horarios },
    },
    include: { horarios: true },
  });
}

export function inscribirEventoDirecto(clubId: string, eventoId: string, socioId: string) {
  return db.inscripcionEvento.create({ data: { clubId, eventoId, socioId } });
}

export function anotarEsperaDirecto(clubId: string, socioId: string, ref: { actividadId?: string; eventoId?: string }) {
  return db.listaEspera.create({ data: { clubId, socioId, ...ref } });
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
    concepto?: "CUOTA" | "ACTIVIDAD" | "EVENTO";
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
    hora?: string;
    tipo?: "SUSPENDIDA" | "REPROGRAMADA";
    nuevaFecha?: Date | null;
    nuevaHora?: string | null;
    motivo?: string;
  } = {},
) {
  return db.excepcionClase.create({
    data: { clubId, actividadId, fecha: new Date(Date.UTC(2026, 9, 21)), hora: "19:00", tipo: "SUSPENDIDA", motivo: "Feriado", ...over },
  });
}

export function crearEvento(
  clubId: string,
  over: {
    titulo?: string;
    fecha?: Date;
    hora?: string;
    duracionMin?: number;
    lugar?: string | null;
    descripcion?: string | null;
    actividadId?: string | null;
    conInscripcion?: boolean;
    cupo?: number | null;
    precio?: number;
  } = {},
) {
  const n = siguiente();
  return db.evento.create({
    data: { clubId, titulo: `Evento ${n}`, fecha: new Date(Date.UTC(2026, 9, 20)), hora: "20:00", ...over },
  });
}

export function crearUsuario(over: { email?: string; rol?: "SUPERADMIN" | "ADMIN_CLUB" | "SOCIO"; clubId?: string | null } = {}) {
  const n = siguiente();
  return db.usuario.create({ data: { email: `usuario${n}@test.com`, rol: "SOCIO", ...over } });
}

/** Socio con usuario de login (y su mismo email). */
export async function crearSocioConUsuario(clubId: string, over: { activo?: boolean; telefono?: string | null; tipoSocioId?: string } = {}) {
  const usuario = await crearUsuario({ rol: "SOCIO", clubId });
  const socio = await crearSocio(clubId, { email: usuario.email, usuarioId: usuario.id, ...over });
  return { socio, usuario };
}
