import Link from "next/link";
import { leerAviso } from "@/lib/aviso";
import { requireClub } from "@/lib/session";
import { formatDiaCorto, formatPesos } from "@/lib/format";
import { inicioDelDia } from "@/lib/periodo";
import { cambiarEstadoActividadAction, crearActividadAction, editarActividadAction } from "@/modules/actividades/actions";
import { listarActividades, obtenerActividad } from "@/modules/actividades/service";
import {
  crearEventoAction,
  eliminarEventoAction,
  reprogramarClaseAction,
  restablecerClaseAction,
  suspenderClaseAction,
} from "@/modules/calendario/actions";
import { CalendarioMes } from "@/modules/calendario/components/CalendarioMes";
import { CalendarioSemana } from "@/modules/calendario/components/CalendarioSemana";
import { estadoClase, formatHorarios } from "@/modules/calendario/components/etiquetas";
import { FormActividad, FormEvento } from "@/modules/calendario/components/Formularios";
import { NavegacionMesAgenda, NavegacionSemana, SelectorVista } from "@/modules/calendario/components/Navegacion";
import { obtenerEvento, proximosEventosClub } from "@/modules/calendario/eventos.service";
import { claveDia, horaFin, parsearDia, semanaDe, semanasDelMes, type ItemCalendario } from "@/modules/calendario/reglas";
import { calendarioClub, claveClase, obtenerClase } from "@/modules/calendario/service";
import { hrefAgenda, vistaDeParams } from "@/modules/calendario/vista";
import { Aviso, Boton, Card, Tabla, Titulo } from "@/components/ui";

type Params = {
  vista?: string;
  semana?: string;
  mes?: string;
  nuevo?: string;
  clase?: string;
  evento?: string;
  actividad?: string;
  ok?: string;
  error?: string;
  f?: string;
};

const vigencia = (a: { fechaInicio: Date; fechaFin: Date | null }) =>
  a.fechaFin ? `${formatDiaCorto(a.fechaInicio)} al ${formatDiaCorto(a.fechaFin)}` : `Desde ${formatDiaCorto(a.fechaInicio)}`;

export default async function AgendaAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Params>;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const sp = await searchParams;
  // Los servicios y vistaDeParams reciben el instante actual; `hoy` (medianoche) es solo para mostrar.
  const ahora = new Date();
  const hoy = inicioDelDia(ahora);
  const v = vistaDeParams(sp, ahora);
  const base = `/c/${slug}/admin/agenda`;
  const volver = `vista=${v.vista}&semana=${v.semana}&mes=${v.mes}`;
  const href = (extra: Record<string, string> = {}) => hrefAgenda(base, v, extra);

  const dias = semanaDe(parsearDia(v.semana)!);
  const semanas = semanasDelMes(v.mes);
  const [desde, hasta] = v.vista === "semana" ? [dias[0], dias[6]] : [semanas[0][0], semanas.at(-1)![6]];

  const [items, actividades, proximos, clase, evento, actividad] = await Promise.all([
    v.vista === "lista" ? [] : calendarioClub(club.id, desde, hasta),
    listarActividades(club.id),
    v.vista === "lista" ? proximosEventosClub(club.id, ahora) : [],
    sp.clase ? obtenerClase(club.id, sp.clase) : null,
    sp.evento ? obtenerEvento(club.id, sp.evento) : null,
    sp.actividad ? obtenerActividad(club.id, sp.actividad) : null,
  ]);

  const hrefItem = (i: ItemCalendario) =>
    i.tipo === "EVENTO"
      ? href({ evento: i.eventoId! })
      : href({
          clase: i.estado === "REPROGRAMADA"
            ? claveClase(i.actividadId!, claveDia(i.fechaOriginal!), i.horaOriginal!)
            : claveClase(i.actividadId!, claveDia(i.fecha), i.hora),
        });
  const clasePasada = clase ? clase.fecha.getTime() < hoy.getTime() : false;
  const nuevo = sp.nuevo === "evento" ? "evento" : "actividad";
  const activas = actividades.filter((a) => a.activa);

  return (
    <>
      <Titulo sub="Actividades recurrentes, clases de cada semana y eventos del club">Agenda</Titulo>
      <Aviso {...leerAviso(sp)} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SelectorVista base={base} v={v} />
              {v.vista === "semana" && <NavegacionSemana base={base} v={v} hoy={hoy} />}
              {v.vista === "mes" && <NavegacionMesAgenda base={base} v={v} />}
            </div>

            {v.vista === "semana" && <CalendarioSemana dias={dias} items={items} hoy={hoy} hrefItem={hrefItem} />}
            {v.vista === "mes" && <CalendarioMes periodo={v.mes} items={items} hoy={hoy} hrefItem={hrefItem} />}

            {v.vista === "lista" && (
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="mb-2 font-semibold text-slate-800">Actividades</h3>
                  <Tabla headers={["Actividad", "Días y horarios", "Vigencia", "Arancel", "Inscriptos", "En espera"]}>
                    {actividades.map((a) => (
                      <tr key={a.id} className={a.activa ? "" : "text-slate-400"}>
                        <td className="py-2 pr-4 font-medium">
                          <Link href={href({ actividad: a.id })} className="hover:underline">
                            {a.nombre}
                          </Link>
                          {!a.activa && <span className="ml-1 text-xs">(inactiva)</span>}
                        </td>
                        <td className="py-2 pr-4">{formatHorarios(a.horarios)}</td>
                        <td className="py-2 pr-4">{vigencia(a)}</td>
                        <td className="py-2 pr-4">{a.arancel > 0 ? `${formatPesos(a.arancel)}/mes` : "Gratis"}</td>
                        <td className="py-2 pr-4">
                          {a._count.inscripciones} / {a.cupo}
                        </td>
                        <td className="py-2 pr-4">{a._count.listaEspera || "—"}</td>
                      </tr>
                    ))}
                  </Tabla>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold text-slate-800">Próximos eventos</h3>
                  {proximos.length === 0 ? (
                    <p className="text-sm text-slate-500">No hay eventos próximos.</p>
                  ) : (
                    <Tabla headers={["Fecha", "Evento", "Para", "Inscripción", "Precio"]}>
                      {proximos.map((e) => (
                        <tr key={e.id}>
                          <td className="py-2 pr-4">
                            {formatDiaCorto(e.fecha)} {e.hora}
                          </td>
                          <td className="py-2 pr-4 font-medium">
                            <Link href={href({ evento: e.id })} className="hover:underline">
                              {e.titulo}
                            </Link>
                          </td>
                          <td className="py-2 pr-4">{e.actividad ? e.actividad.nombre : "Todo el club"}</td>
                          <td className="py-2 pr-4">
                            {e.conInscripcion
                              ? `${e._count.inscripciones}${e.cupo ? ` / ${e.cupo}` : " inscriptos"}${e._count.listaEspera ? ` · ${e._count.listaEspera} en espera` : ""}`
                              : "Informativo"}
                          </td>
                          <td className="py-2 pr-4">{e.precio > 0 ? formatPesos(e.precio) : "—"}</td>
                        </tr>
                      ))}
                    </Tabla>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {clase && (
            <Card title="Clase seleccionada">
              <p className="text-sm text-slate-700">
                <strong>{clase.actividad.nombre}</strong> · {formatDiaCorto(clase.fecha)} · {clase.horario.hora}–
                {horaFin(clase.horario.hora, clase.horario.duracionMin)}
              </p>
              <Link href={href({ actividad: clase.actividad.id })} className="text-sm text-emerald-700 underline">
                Ver actividad
              </Link>
              {!clase.excepcion && <p className="mt-1 text-sm text-slate-500">{estadoClase(null)}</p>}
              {clase.excepcion ? (
                <div className="mt-3 flex flex-col gap-3 text-sm">
                  <p className="text-slate-600">{estadoClase(clase.excepcion)}</p>
                  {!clasePasada && (
                    <form action={restablecerClaseAction.bind(null, slug, volver, clase.excepcion.id)}>
                      <Boton variante="secundario">Restablecer</Boton>
                    </form>
                  )}
                </div>
              ) : clasePasada ? (
                <p className="mt-3 text-sm text-slate-500">Clase pasada: solo lectura.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-5">
                  <form
                    action={suspenderClaseAction.bind(null, slug, volver, clase.actividad.id, claveDia(clase.fecha), clase.horario.hora)}
                    className="flex flex-col gap-3"
                  >
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-slate-700">Motivo de la suspensión</span>
                      <input name="motivo" placeholder="Feriado, lluvia…" required className="rounded-lg border border-slate-300 px-3 py-2" />
                    </label>
                    <Boton variante="peligro">Suspender clase</Boton>
                  </form>
                  <form
                    action={reprogramarClaseAction.bind(null, slug, volver, clase.actividad.id, claveDia(clase.fecha), clase.horario.hora)}
                    className="flex flex-col gap-3 border-t border-slate-100 pt-4"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="font-medium text-slate-700">Nueva fecha</span>
                        <input name="nuevaFecha" type="date" min={claveDia(hoy)} required className="rounded-lg border border-slate-300 px-3 py-2" />
                      </label>
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="font-medium text-slate-700">Nueva hora</span>
                        <input name="nuevaHora" type="time" defaultValue={clase.horario.hora} required className="rounded-lg border border-slate-300 px-3 py-2" />
                      </label>
                    </div>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-medium text-slate-700">Motivo</span>
                      <input name="motivo" required className="rounded-lg border border-slate-300 px-3 py-2" />
                    </label>
                    <Boton variante="secundario">Reprogramar</Boton>
                  </form>
                </div>
              )}
            </Card>
          )}

          {evento && (
            <Card title="Evento seleccionado">
              <p className="text-sm text-slate-700">
                <strong>{evento.titulo}</strong> · {formatDiaCorto(evento.fecha)} {evento.hora}–{horaFin(evento.hora, evento.duracionMin)}
              </p>
              {evento.lugar && <p className="text-sm text-slate-600">Lugar: {evento.lugar}</p>}
              {evento.descripcion && <p className="text-sm text-slate-600">{evento.descripcion}</p>}
              <p className="text-sm text-slate-500">
                Para: {evento.actividad ? `inscriptos de ${evento.actividad.nombre}` : "todo el club"}
              </p>
              {evento.conInscripcion ? (
                <div className="mt-3 text-sm">
                  <p className="font-medium text-slate-700">
                    Inscriptos: {evento.inscripciones.length}
                    {evento.cupo ? ` / ${evento.cupo}` : ""} {evento.precio > 0 && `· ${formatPesos(evento.precio)} c/u`}
                  </p>
                  <ListaSocios socios={evento.inscripciones.map((i) => i.socio)} vacio="Todavía no hay inscriptos." />
                  {evento.listaEspera.length > 0 && (
                    <>
                      <p className="mt-2 font-medium text-slate-700">En lista de espera: {evento.listaEspera.length}</p>
                      <ListaSocios socios={evento.listaEspera.map((i) => i.socio)} />
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Evento informativo (sin inscripción).</p>
              )}
              <form action={eliminarEventoAction.bind(null, slug, volver, evento.id)} className="mt-3">
                <Boton variante="peligro">Eliminar evento</Boton>
              </form>
              {evento.precio > 0 && evento.inscripciones.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">Al eliminarlo se anulan los cargos pendientes de los inscriptos.</p>
              )}
            </Card>
          )}

          {actividad && (
            <Card title={actividad.nombre}>
              <p className="text-sm text-slate-700">{formatHorarios(actividad.horarios)}</p>
              <p className="text-sm text-slate-500">
                {vigencia(actividad)} · {actividad.arancel > 0 ? `${formatPesos(actividad.arancel)}/mes` : "Gratis"}
              </p>
              {actividad.descripcion && <p className="mt-1 text-sm text-slate-600">{actividad.descripcion}</p>}
              <div className="mt-3 text-sm">
                <p className="font-medium text-slate-700">
                  Inscriptos: {actividad.inscripciones.length} / {actividad.cupo}
                </p>
                <ListaSocios socios={actividad.inscripciones.map((i) => i.socio)} vacio="Todavía no hay inscriptos." />
                {actividad.listaEspera.length > 0 && (
                  <>
                    <p className="mt-2 font-medium text-slate-700">En lista de espera: {actividad.listaEspera.length}</p>
                    <ListaSocios socios={actividad.listaEspera.map((i) => i.socio)} />
                  </>
                )}
              </div>
              <details className="mt-4 border-t border-slate-100 pt-3">
                <summary className="cursor-pointer text-sm font-medium text-emerald-700">Editar actividad</summary>
                <div className="mt-3">
                  <FormActividad
                    action={editarActividadAction.bind(null, slug, volver, actividad.id)}
                    actividad={actividad}
                    hoy={hoy}
                    boton="Guardar cambios"
                  />
                </div>
              </details>
              <form
                action={cambiarEstadoActividadAction.bind(null, slug, volver, actividad.id, !actividad.activa)}
                className="mt-3"
              >
                <Boton variante={actividad.activa ? "peligro" : "secundario"}>
                  {actividad.activa ? "Desactivar actividad" : "Reactivar actividad"}
                </Boton>
              </form>
            </Card>
          )}

          <Card title="Nuevo">
            <div className="mb-4 inline-flex overflow-hidden rounded-lg border border-slate-200 text-sm">
              {(["actividad", "evento"] as const).map((tipo) => (
                <Link
                  key={tipo}
                  href={href({ nuevo: tipo })}
                  className={`px-3 py-1.5 ${nuevo === tipo ? "bg-emerald-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  {tipo === "actividad" ? "Actividad" : "Evento"}
                </Link>
              ))}
            </div>
            <p className="mb-3 text-xs text-slate-500">
              {nuevo === "actividad"
                ? "Se repite todas las semanas en los días elegidos, con inscripción mensual."
                : "Sucede una sola vez. Puede ser informativo o con inscripción (cupo y precio opcionales)."}
            </p>
            {nuevo === "actividad" ? (
              <FormActividad action={crearActividadAction.bind(null, slug, volver)} hoy={hoy} boton="Crear actividad" />
            ) : (
              <FormEvento action={crearEventoAction.bind(null, slug, volver)} actividades={activas} hoy={hoy} />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function ListaSocios({ socios, vacio }: { socios: { id: string; nombre: string; apellido: string; nroSocio: number }[]; vacio?: string }) {
  if (socios.length === 0) return vacio ? <p className="text-slate-500">{vacio}</p> : null;
  return (
    <ol className="mt-1 list-decimal pl-5 text-slate-600">
      {socios.map((s) => (
        <li key={s.id}>
          {s.nombre} {s.apellido} <span className="text-slate-400">· N° {s.nroSocio}</span>
        </li>
      ))}
    </ol>
  );
}
