// Punto único de emisión de avisos. Arma el texto según el evento, resuelve destinatarios y
// canales del club y entrega. Nunca lanza: un aviso que falla no debe romper la operación que
// lo disparó (el pago, la suspensión de una clase…).
import { db } from "@/lib/db";
import { formatDia, formatDiaCorto, formatPesos } from "@/lib/format";
import { canalesActivos, entregar, type Destinatario, type Entrega } from "./canales";
import * as para from "./destinatarios";
import type { EventoAviso } from "./eventos";

const a = (destinatarios: Destinatario[], titulo: string, cuerpo: string, link: string | null): Entrega[] =>
  destinatarios.map((destinatario) => ({ destinatario, titulo, cuerpo, link }));

const clase = (fecha: Date, hora: string) => `${formatDiaCorto(fecha)} ${hora}`;

async function nombreActividad(id: string) {
  return (await db.actividad.findUnique({ where: { id }, select: { nombre: true } }))?.nombre ?? "una actividad";
}

/** Entregas (destinatario + texto) de cada evento. */
async function armar(clubId: string, slug: string, ev: EventoAviso): Promise<Entrega[]> {
  const socio = `/c/${slug}/socio`;
  switch (ev.tipo) {
    case "PAGO_ACREDITADO":
      return a(await para.sociosPorId(clubId, [ev.socioId]), "Pago acreditado", `Recibimos tu pago de ${formatPesos(ev.monto)}. ¡Gracias!`, socio);

    case "CARGOS_GENERADOS": {
      const destinatarios = await para.sociosPorId(clubId, ev.socios.map((s) => s.socioId));
      return destinatarios.flatMap((d) => {
        const c = ev.socios.find((s) => s.socioId === d.socioId)!;
        return a([d], `Ya podés pagar ${ev.periodo}`, `Tenés ${formatPesos(c.monto)} a pagar, vence el ${formatDia(c.vencimiento)}.`, socio);
      });
    }

    case "CLASE_SUSPENDIDA": {
      const nombre = await nombreActividad(ev.actividadId);
      return a(await para.inscriptosActividad(clubId, ev.actividadId), `Clase suspendida: ${nombre}`,
        `La clase del ${clase(ev.fecha, ev.hora)} se suspende. Motivo: ${ev.motivo}.`, `${socio}/calendario`);
    }

    case "CLASE_REPROGRAMADA": {
      const nombre = await nombreActividad(ev.actividadId);
      return a(await para.inscriptosActividad(clubId, ev.actividadId), `Clase reprogramada: ${nombre}`,
        `La clase del ${clase(ev.fecha, ev.hora)} pasa al ${clase(ev.nuevaFecha, ev.nuevaHora)}. Motivo: ${ev.motivo}.`,
        `${socio}/calendario`);
    }

    case "CLASE_RESTABLECIDA": {
      const nombre = await nombreActividad(ev.actividadId);
      return a(await para.inscriptosActividad(clubId, ev.actividadId), `Clase confirmada: ${nombre}`,
        `La clase del ${clase(ev.fecha, ev.hora)} vuelve a su horario habitual.`, `${socio}/calendario`);
    }

    case "ACTIVIDAD_NUEVA": {
      const nombre = await nombreActividad(ev.actividadId);
      return a(await para.todosLosSocios(clubId), `Nueva actividad: ${nombre}`,
        "El club sumó una actividad nueva. Mirá los días y horarios e inscribite.", `${socio}/actividades`);
    }

    case "ACTIVIDAD_EDITADA": {
      const nombre = await nombreActividad(ev.actividadId);
      return a(await para.inscriptosActividad(clubId, ev.actividadId), `Cambió el horario de ${nombre}`,
        "La actividad cambió sus días, horarios o fechas. Revisá tu calendario.", `${socio}/calendario`);
    }

    case "EVENTO_NUEVO": {
      const e = await db.evento.findUnique({ where: { id: ev.eventoId } });
      if (!e) return [];
      const extra = e.conInscripcion ? " Inscribite desde Actividades y eventos." : "";
      return a(await para.audiencia(clubId, e.actividadId), `Nuevo evento: ${e.titulo}`,
        `${clase(e.fecha, e.hora)}${e.lugar ? ` en ${e.lugar}` : ""}.${extra}`, `${socio}/actividades`);
    }

    case "EVENTO_CANCELADO":
      return a(await para.audiencia(clubId, ev.actividadId), `Evento cancelado: ${ev.titulo}`,
        `El evento del ${clase(ev.fecha, ev.hora)} se canceló.`, `${socio}/actividades`);

    case "LUGAR_LIBERADO": {
      const titulo = ev.actividadId
        ? await nombreActividad(ev.actividadId)
        : ((await db.evento.findUnique({ where: { id: ev.eventoId }, select: { titulo: true } }))?.titulo ?? "un evento");
      const ref = ev.actividadId ? { actividadId: ev.actividadId } : { eventoId: ev.eventoId! };
      return a(await para.enListaDeEspera(clubId, ref), `Se liberó un lugar en ${titulo}`,
        "Estabas en la lista de espera: inscribite antes que otro lo ocupe.", `${socio}/actividades`);
    }

    case "AVISO_CLUB":
      return a(await para.audiencia(clubId, ev.actividadId), ev.asunto, ev.mensaje, socio);
  }
}

export async function notificar(clubId: string, evento: EventoAviso): Promise<void> {
  try {
    const club = await db.club.findUnique({ where: { id: clubId }, select: { slug: true, canales: true } });
    if (!club) return;
    const entregas = await armar(clubId, club.slug, evento);
    if (entregas.length) await entregar(clubId, evento.tipo, entregas, canalesActivos(club.canales));
  } catch (e) {
    console.error(`No se pudo notificar ${evento.tipo}`, e);
  }
}

/** Aviso del admin general a los admins de club (de todos o de uno): in-app y mail. */
export async function notificarAdmins(aviso: { asunto: string; mensaje: string; clubId: string | null }): Promise<void> {
  try {
    const admins = await para.adminsDeClub(aviso.clubId);
    const porClub = new Map<string | null, Destinatario[]>();
    const usuarios = await db.usuario.findMany({ where: { id: { in: admins.map((x) => x.usuarioId!) } }, select: { id: true, clubId: true } });
    for (const d of admins) {
      const clubId = usuarios.find((u) => u.id === d.usuarioId)?.clubId ?? null;
      porClub.set(clubId, [...(porClub.get(clubId) ?? []), d]);
    }
    for (const [clubId, destinatarios] of porClub) {
      const club = clubId ? await db.club.findUnique({ where: { id: clubId }, select: { slug: true } }) : null;
      const link = club ? `/c/${club.slug}/admin` : null;
      await entregar(clubId, "AVISO_PLATAFORMA", a(destinatarios, aviso.asunto, aviso.mensaje, link), ["IN_APP", "EMAIL"]);
    }
  } catch (e) {
    console.error("No se pudo avisar a los admins", e);
  }
}
