// A quién le llega cada aviso. Solo socios activos; el email es el del socio o, si no tiene, el
// de su usuario.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Destinatario } from "./canales";

async function deSocios(where: Prisma.SocioWhereInput): Promise<(Destinatario & { socioId: string })[]> {
  const socios = await db.socio.findMany({
    where: { ...where, activo: true },
    select: { id: true, usuarioId: true, email: true, telefono: true, usuario: { select: { email: true } } },
  });
  return socios.map((s) => ({
    socioId: s.id,
    usuarioId: s.usuarioId,
    email: s.email ?? s.usuario?.email ?? null,
    telefono: s.telefono,
  }));
}

export const todosLosSocios = (clubId: string) => deSocios({ clubId });

export const sociosPorId = (clubId: string, ids: string[]) => deSocios({ clubId, id: { in: ids } });

export const inscriptosActividad = (clubId: string, actividadId: string) =>
  deSocios({ clubId, inscripciones: { some: { actividadId } } });

export const inscriptosEvento = (clubId: string, eventoId: string) =>
  deSocios({ clubId, inscripcionesEvento: { some: { eventoId } } });

export const enListaDeEspera = (clubId: string, ref: { actividadId?: string; eventoId?: string }) =>
  deSocios({ clubId, listaEspera: { some: ref } });

/** Audiencia de un evento o aviso: todo el club o los inscriptos de una actividad. */
export const audiencia = (clubId: string, actividadId: string | null) =>
  actividadId ? inscriptosActividad(clubId, actividadId) : todosLosSocios(clubId);

export async function adminsDeClub(clubId: string | null): Promise<Destinatario[]> {
  const admins = await db.usuario.findMany({
    where: { rol: "ADMIN_CLUB", ...(clubId ? { clubId } : { clubId: { not: null } }) },
    select: { id: true, email: true },
  });
  return admins.map((a) => ({ usuarioId: a.id, email: a.email, telefono: null }));
}
