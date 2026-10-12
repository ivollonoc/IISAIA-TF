"use server";

// Server Actions del socio en su Agenda: actividades, eventos y lista de espera. El socioId sale
// siempre de la sesión, nunca del formulario; vuelven a la pestaña Actividades y eventos.
import { ejecutar } from "@/lib/action";
import { formatPesos } from "@/lib/format";
import { requireClub } from "@/lib/session";
import { anotarEnEspera, salirDeEspera } from "@/modules/actividades/lista-espera.service";
import { cancelarInscripcion, inscribir } from "@/modules/actividades/service";
import { cancelarInscripcionEvento, inscribirEvento } from "./eventos.service";
import { rutaActividadesSocio } from "./vista";

const conCargo = (cargo: { monto: number } | null) =>
  cargo ? `Inscripción confirmada. Se agregó el cargo de ${formatPesos(cargo.monto)} a tu cuenta` : "Inscripción confirmada";

export async function inscribirActividadAction(slug: string, actividadId: string) {
  await ejecutar(rutaActividadesSocio(slug), async () => {
    const { club, user } = await requireClub(slug, "socio");
    return conCargo((await inscribir(club.id, actividadId, user.socioId!)).cargo);
  });
}

export async function cancelarActividadAction(slug: string, actividadId: string) {
  await ejecutar(rutaActividadesSocio(slug), async () => {
    const { club, user } = await requireClub(slug, "socio");
    await cancelarInscripcion(club.id, actividadId, user.socioId!);
    return "Inscripción cancelada";
  });
}

export async function inscribirEventoAction(slug: string, eventoId: string) {
  await ejecutar(rutaActividadesSocio(slug), async () => {
    const { club, user } = await requireClub(slug, "socio");
    return conCargo((await inscribirEvento(club.id, eventoId, user.socioId!)).cargo);
  });
}

export async function cancelarEventoAction(slug: string, eventoId: string) {
  await ejecutar(rutaActividadesSocio(slug), async () => {
    const { club, user } = await requireClub(slug, "socio");
    await cancelarInscripcionEvento(club.id, eventoId, user.socioId!);
    return "Inscripción al evento cancelada";
  });
}

const ref = (tipo: "actividad" | "evento", id: string) => (tipo === "actividad" ? { actividadId: id } : { eventoId: id });

export async function anotarEsperaAction(slug: string, tipo: "actividad" | "evento", id: string) {
  await ejecutar(rutaActividadesSocio(slug), async () => {
    const { club, user } = await requireClub(slug, "socio");
    await anotarEnEspera(club.id, user.socioId!, ref(tipo, id));
    return "Te anotamos en la lista de espera: te avisamos si se libera un lugar";
  });
}

export async function salirEsperaAction(slug: string, tipo: "actividad" | "evento", id: string) {
  await ejecutar(rutaActividadesSocio(slug), async () => {
    const { club, user } = await requireClub(slug, "socio");
    await salirDeEspera(club.id, user.socioId!, ref(tipo, id));
    return "Saliste de la lista de espera";
  });
}
