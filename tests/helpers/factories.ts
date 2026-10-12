// Datos mínimos para armar cada caso. Escriben directo con Prisma (no pasan por los
// servicios bajo test) y cada llamada genera valores únicos.
import { db } from "@/lib/db";

let seq = 0;
const siguiente = () => ++seq;

export function crearClub(over: { nombre?: string; slug?: string } = {}) {
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
  over: { nombre?: string; diaSemana?: number; hora?: string; cupo?: number; activa?: boolean } = {},
) {
  const n = siguiente();
  return db.actividad.create({
    data: { clubId, nombre: `Actividad ${n}`, diaSemana: 1, hora: "18:00", cupo: 10, activa: true, ...over },
  });
}

export function inscribirDirecto(clubId: string, actividadId: string, socioId: string) {
  return db.inscripcion.create({ data: { clubId, actividadId, socioId } });
}

export function crearPagoDirecto(clubId: string, socioId: string, over: { periodo?: string; monto?: number } = {}) {
  return db.pago.create({
    data: { clubId, socioId, periodo: "2026-01", monto: 10000, medio: "EFECTIVO", ...over },
  });
}
