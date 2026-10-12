import { leerAviso } from "@/lib/aviso";
import { requireClub } from "@/lib/session";
import { formatDiaCorto } from "@/lib/format";
import { inicioDelDia } from "@/lib/periodo";
import { listarActividades } from "@/modules/actividades/service";
import {
  crearEventoAction,
  eliminarEventoAction,
  reprogramarClaseAction,
  restablecerClaseAction,
  suspenderClaseAction,
} from "@/modules/calendario/actions";
import { CalendarioMes } from "@/modules/calendario/components/CalendarioMes";
import { estadoClase } from "@/modules/calendario/components/etiquetas";
import { NavegacionMes } from "@/modules/calendario/components/NavegacionMes";
import { claveDia, horaFin, mesDeParam, semanasDelMes, type ItemCalendario } from "@/modules/calendario/reglas";
import { calendarioClub, obtenerClase, obtenerEvento } from "@/modules/calendario/service";
import { Aviso, Boton, Campo, Card, Selector, Titulo } from "@/components/ui";

export default async function CalendarioAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mes?: string; clase?: string; evento?: string; ok?: string; error?: string; f?: string }>;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const sp = await searchParams;
  const periodo = mesDeParam(sp.mes);
  const semanas = semanasDelMes(periodo);
  const hoy = inicioDelDia();
  const base = `/c/${slug}/admin/calendario`;

  const [items, actividades, clase, evento] = await Promise.all([
    calendarioClub(club.id, semanas[0][0], semanas.at(-1)![6]),
    listarActividades(club.id),
    sp.clase ? obtenerClase(club.id, sp.clase) : null,
    sp.evento ? obtenerEvento(club.id, sp.evento) : null,
  ]);

  const hrefItem = (i: ItemCalendario) =>
    i.tipo === "EVENTO"
      ? `${base}?mes=${periodo}&evento=${i.eventoId}`
      : `${base}?mes=${periodo}&clase=${i.actividadId}:${claveDia(i.estado === "REPROGRAMADA" ? i.fechaOriginal! : i.fecha)}`;
  const clasePasada = clase ? clase.fecha.getTime() < hoy.getTime() : false;

  return (
    <>
      <Titulo sub="Clases de cada semana, cambios y eventos del club">Calendario</Titulo>
      <Aviso {...leerAviso(sp)} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <NavegacionMes periodo={periodo} base={base} />
            <CalendarioMes periodo={periodo} items={items} hoy={hoy} hrefItem={hrefItem} />
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {clase && (
            <Card title="Clase seleccionada">
              <p className="text-sm text-slate-700">
                <strong>{clase.actividad.nombre}</strong> · {formatDiaCorto(clase.fecha)} · {clase.actividad.hora}–
                {horaFin(clase.actividad.hora, clase.actividad.duracionMin)}
              </p>
              {!clase.excepcion && <p className="mt-1 text-sm text-slate-500">{estadoClase(null)}</p>}
              {clase.excepcion ? (
                <div className="mt-3 flex flex-col gap-3 text-sm">
                  <p className="text-slate-600">{estadoClase(clase.excepcion)}</p>
                  {!clasePasada && (
                    <form action={restablecerClaseAction.bind(null, slug, periodo, clase.excepcion.id)}>
                      <Boton variante="secundario">Restablecer</Boton>
                    </form>
                  )}
                </div>
              ) : clasePasada ? (
                <p className="mt-3 text-sm text-slate-500">Clase pasada: solo lectura.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-5">
                  <form
                    action={suspenderClaseAction.bind(null, slug, periodo, clase.actividad.id, claveDia(clase.fecha))}
                    className="flex flex-col gap-3"
                  >
                    <Campo label="Motivo de la suspensión" name="motivo" placeholder="Feriado, lluvia…" required />
                    <Boton variante="peligro">Suspender clase</Boton>
                  </form>
                  <form
                    action={reprogramarClaseAction.bind(null, slug, periodo, clase.actividad.id, claveDia(clase.fecha))}
                    className="flex flex-col gap-3 border-t border-slate-100 pt-4"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <Campo label="Nueva fecha" name="nuevaFecha" type="date" min={claveDia(hoy)} required />
                      <Campo label="Nueva hora" name="nuevaHora" type="time" defaultValue={clase.actividad.hora} required />
                    </div>
                    <Campo label="Motivo" name="motivo" required />
                    <Boton variante="secundario">Reprogramar</Boton>
                  </form>
                </div>
              )}
            </Card>
          )}

          {evento && (
            <Card title="Evento seleccionado">
              <p className="text-sm text-slate-700">
                <strong>{evento.titulo}</strong> · {formatDiaCorto(evento.fecha)} {evento.hora}
              </p>
              {evento.lugar && <p className="text-sm text-slate-600">Lugar: {evento.lugar}</p>}
              {evento.descripcion && <p className="text-sm text-slate-600">{evento.descripcion}</p>}
              <p className="text-sm text-slate-500">
                Para: {evento.actividad ? `inscriptos de ${evento.actividad.nombre}` : "todo el club"}
              </p>
              <form action={eliminarEventoAction.bind(null, slug, periodo, evento.id)} className="mt-3">
                <Boton variante="peligro">Eliminar evento</Boton>
              </form>
            </Card>
          )}

          <Card title="Nuevo evento">
            <form action={crearEventoAction.bind(null, slug, periodo)} className="flex flex-col gap-3">
              <Campo label="Título" name="titulo" placeholder="Asamblea anual" required />
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Fecha" name="fecha" type="date" min={claveDia(hoy)} required />
                <Campo label="Hora" name="hora" type="time" required />
              </div>
              <Campo label="Lugar (opcional)" name="lugar" />
              <Campo label="Descripción (opcional)" name="descripcion" />
              <Selector label="Para" name="actividadId" defaultValue="">
                <option value="">Todo el club</option>
                {actividades
                  .filter((a) => a.activa)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      Inscriptos de {a.nombre}
                    </option>
                  ))}
              </Selector>
              <Boton type="submit">Crear evento</Boton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
