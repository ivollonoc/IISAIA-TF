"use server";

// Server Actions del socio: reservas de clases, eventos y lista de espera. El socioId sale
// siempre de la sesión, nunca del formulario; vuelven a la pestaña Actividades y eventos.
import { ejecutar } from "@/lib/action";
import { formatPesos } from "@/lib/format";
import { requireClub } from "@/lib/session";
import { anotarEnEspera, salirDeEspera, type RefEspera } from "@/modules/actividades/lista-espera.service";
import { claseSchema } from "@/modules/reservas/schema";
import { cancelarReserva, reservar, reservarSerie } from "@/modules/reservas/service";
import { cancelarInscripcionEvento, inscribirEvento } from "./eventos.service";
import { rutaActividadesSocio } from "./vista";

const conCargo = (texto: string, cargo: { monto: number } | null) =>
  cargo ? `${texto}. Se agregó el cargo de ${formatPesos(cargo.monto)} a tu cuenta` : texto;

/** Una clase identificada en el botón: "<actividadId>|<AAAA-MM-DD>|<HH:MM>". */
const clase = (actividadId: string, fecha: string, hora: string) => ({ actividadId, fecha, hora });

export async function reservarClaseAction(slug: string, actividadId: string, fecha: string, hora: string) {
  await ejecutar(rutaActividadesSocio(slug), async () => {
    const { club, user } = await requireClub(slug, "socio");
    return conCargo("Clase reservada", (await reservar(club.id, user.socioId!, clase(actividadId, fecha, hora))).cargo);
  });
}

export async function cancelarReservaAction(slug: string, actividadId: string, fecha: string, hora: string) {
  await ejecutar(rutaActividadesSocio(slug), async () => {
    const { club, user } = await requireClub(slug, "socio");
    await cancelarReserva(club.id, user.socioId!, clase(actividadId, fecha, hora));
    return "Reserva cancelada";
  });
}

/** Reserva las próximas N semanas de un horario (el formulario manda "horario" = "<día>|<HH:MM>" y "semanas"). */
export async function reservarSerieAction(slug: string, actividadId: string, formData: FormData) {
  await ejecutar(rutaActividadesSocio(slug), async () => {
    const { club, user } = await requireClub(slug, "socio");
    const [diaSemana, hora] = String(formData.get("horario") ?? "").split("|");
    const r = await reservarSerie(club.id, user.socioId!, { actividadId, diaSemana, hora, semanas: formData.get("semanas") });
    const partes = [`Reservaste ${r.reservadas} ${r.reservadas === 1 ? "clase" : "clases"}`];
    if (r.completas) partes.push(`${r.completas} sin lugar`);
    if (r.otras) partes.push(`${r.otras} ya reservadas o no disponibles`);
    return partes.join(" · ");
  });
}

export async function inscribirEventoAction(slug: string, eventoId: string) {
  await ejecutar(rutaActividadesSocio(slug), async () => {
    const { club, user } = await requireClub(slug, "socio");
    return conCargo("Inscripción confirmada", (await inscribirEvento(club.id, eventoId, user.socioId!)).cargo);
  });
}

export async function cancelarEventoAction(slug: string, eventoId: string) {
  await ejecutar(rutaActividadesSocio(slug), async () => {
    const { club, user } = await requireClub(slug, "socio");
    await cancelarInscripcionEvento(club.id, eventoId, user.socioId!);
    return "Inscripción al evento cancelada";
  });
}

/** Lista de espera de una clase ("clase", con fecha y hora) o de un evento. */
function ref(tipo: "clase" | "evento", id: string, fecha?: string, hora?: string): RefEspera {
  if (tipo === "evento") return { eventoId: id };
  const c = claseSchema.parse({ actividadId: id, fecha, hora });
  return { actividadId: c.actividadId, fecha: c.fecha, hora: c.hora };
}

export async function anotarEsperaAction(slug: string, tipo: "clase" | "evento", id: string, fecha?: string, hora?: string) {
  await ejecutar(rutaActividadesSocio(slug), async () => {
    const { club, user } = await requireClub(slug, "socio");
    await anotarEnEspera(club.id, user.socioId!, ref(tipo, id, fecha, hora));
    return "Te anotamos en la lista de espera: te avisamos si se libera un lugar";
  });
}

export async function salirEsperaAction(slug: string, tipo: "clase" | "evento", id: string, fecha?: string, hora?: string) {
  await ejecutar(rutaActividadesSocio(slug), async () => {
    const { club, user } = await requireClub(slug, "socio");
    await salirDeEspera(club.id, user.socioId!, ref(tipo, id, fecha, hora));
    return "Saliste de la lista de espera";
  });
}
