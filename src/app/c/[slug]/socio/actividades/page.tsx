import { leerAviso } from "@/lib/aviso";
import { requireClub } from "@/lib/session";
import { formatDiaCorto, formatPesos } from "@/lib/format";
import { inicioDelDia } from "@/lib/periodo";
import { formatHorarios } from "@/modules/calendario/components/etiquetas";
import { eventosParaSocio } from "@/modules/calendario/eventos.service";
import { claveDia, horaFin } from "@/modules/calendario/reglas";
import {
  anotarEsperaAction,
  cancelarEventoAction,
  cancelarReservaAction,
  inscribirEventoAction,
  reservarClaseAction,
  reservarSerieAction,
  salirEsperaAction,
} from "@/modules/calendario/socio.actions";
import { clasesParaSocio } from "@/modules/reservas/service";
import { Aviso, Badge, Boton, Card, Titulo, type SearchParams } from "@/components/ui";

/** Botón de la acción que corresponde: cancelar, inscribirse, anotarse o salir de la lista de espera. */
function AccionInscripcion({
  inscripto,
  enEspera,
  lleno,
  inscribir,
  cancelar,
  anotar,
  salir,
  etiqueta = "Inscribirme",
}: {
  etiqueta?: string;
  inscripto: boolean;
  enEspera: boolean;
  lleno: boolean;
  inscribir: () => Promise<void>;
  cancelar: () => Promise<void>;
  anotar: () => Promise<void>;
  salir: () => Promise<void>;
}) {
  if (inscripto)
    return (
      <form action={cancelar}>
        <Boton variante="peligro">Cancelar</Boton>
      </form>
    );
  if (enEspera)
    return (
      <form action={salir} className="flex flex-col items-end gap-1">
        <span className="text-xs text-amber-700">En lista de espera</span>
        <Boton variante="secundario">Salir de la lista</Boton>
      </form>
    );
  if (lleno)
    return (
      <form action={anotar}>
        <Boton variante="secundario">Avisarme si se libera</Boton>
      </form>
    );
  return (
    <form action={inscribir}>
      <Boton>{etiqueta}</Boton>
    </form>
  );
}

export default async function ActividadesSocioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { club, user } = await requireClub(slug, "socio");
  const ahora = new Date();
  const hoy = inicioDelDia(ahora);
  const socioId = user.socioId!;
  const [actividades, eventos, msg] = await Promise.all([
    clasesParaSocio(club.id, socioId, ahora, 14),
    eventosParaSocio(club.id, socioId, ahora),
    searchParams,
  ]);

  return (
    <>
      <Titulo sub="Reservá tus clases (próximas 2 semanas) e inscribite a los eventos del club">Actividades y eventos</Titulo>
      <Aviso {...leerAviso(msg)} />
      <div className="flex flex-col gap-6">
        {actividades.map((a) => (
          <Card key={a.id} title={a.nombre}>
            <p className="text-sm text-slate-600">
              {formatHorarios(a.horarios)} · {a.precioClase > 0 ? `${formatPesos(a.precioClase)} por clase` : "Gratis"} · cupo {a.cupo}
            </p>
            {a.descripcion && <p className="text-sm text-slate-500">{a.descripcion}</p>}
            {a.clases.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No hay clases en las próximas 2 semanas.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {a.clases.map((c) => {
                  const fecha = claveDia(c.fecha);
                  const lleno = c.reservas >= a.cupo;
                  return (
                    <li key={`${fecha}${c.hora}`} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                      <span className={c.estado === "SUSPENDIDA" ? "text-red-700 line-through" : "text-slate-700"}>
                        <strong>{formatDiaCorto(c.fecha)}</strong> {c.hora}–{c.horaFin}
                        {c.destino && <span className="text-amber-700"> → {formatDiaCorto(c.destino.fecha)} {c.destino.hora}</span>}
                        {c.reservada && <span className="ml-2 no-underline"><Badge ok>Reservada</Badge></span>}
                      </span>
                      {c.estado === "SUSPENDIDA" ? (
                        <span className="text-xs text-red-700">Suspendida{c.motivo ? `: ${c.motivo}` : ""}</span>
                      ) : (
                        <span className="flex items-center gap-3">
                          <span className={`text-xs ${lleno ? "text-amber-700" : "text-slate-500"}`}>
                            {lleno ? "Completa" : `${a.cupo - c.reservas} de ${a.cupo} lugares`}
                          </span>
                          <AccionInscripcion
                            inscripto={c.reservada}
                            enEspera={c.enEspera}
                            lleno={lleno}
                            etiqueta="Reservar"
                            inscribir={reservarClaseAction.bind(null, slug, a.id, fecha, c.hora)}
                            cancelar={cancelarReservaAction.bind(null, slug, a.id, fecha, c.hora)}
                            anotar={anotarEsperaAction.bind(null, slug, "clase", a.id, fecha, c.hora)}
                            salir={salirEsperaAction.bind(null, slug, "clase", a.id, fecha, c.hora)}
                          />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <form action={reservarSerieAction.bind(null, slug, a.id)} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3 text-sm">
              <span className="self-center text-slate-600">Reservar todas las de</span>
              <select name="horario" aria-label="Horario" className="rounded-lg border border-slate-300 bg-white px-2 py-1">
                {a.horarios.map((h) => (
                  <option key={`${h.diaSemana}|${h.hora}`} value={`${h.diaSemana}|${h.hora}`}>
                    {formatHorarios([h])}
                  </option>
                ))}
              </select>
              <span className="self-center text-slate-600">por</span>
              <select name="semanas" defaultValue="4" aria-label="Semanas" className="rounded-lg border border-slate-300 bg-white px-2 py-1">
                {[1, 2, 4, 8, 12].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "semana" : "semanas"}
                  </option>
                ))}
              </select>
              <Boton variante="secundario">Reservar</Boton>
            </form>
          </Card>
        ))}

        <Card title="Próximos eventos">
          {eventos.length === 0 ? (
            <p className="text-sm text-slate-500">No hay eventos próximos.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {eventos.map((e) => {
                const lleno = e.cupo !== null && e.inscriptos >= e.cupo;
                return (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="text-sm">
                      <p className="font-medium text-slate-800">
                        {e.titulo} {e.inscripto && <Badge ok>Inscripto</Badge>}
                      </p>
                      <p className="text-slate-600">
                        {formatDiaCorto(e.fecha)} · {e.hora}–{horaFin(e.hora, e.duracionMin)}
                        {e.lugar && ` · ${e.lugar}`}
                        {e.actividad && ` · Para quienes van a ${e.actividad.nombre}`}
                      </p>
                      {e.descripcion && <p className="text-slate-500">{e.descripcion}</p>}
                      {e.conInscripcion && (
                        <p className="text-xs text-slate-500">
                          {e.precio > 0 ? formatPesos(e.precio) : "Gratis"}
                          {e.cupo !== null && ` · ${lleno ? "Completo" : `quedan ${e.cupo - e.inscriptos} lugares`}`}
                        </p>
                      )}
                    </div>
                    {e.conInscripcion && e.fecha.getTime() <= hoy.getTime() ? (
                      <span className="text-xs text-slate-500">Es hoy: inscripción cerrada</span>
                    ) : e.conInscripcion ? (
                      <AccionInscripcion
                        inscripto={e.inscripto}
                        enEspera={e.enEspera}
                        lleno={lleno}
                        inscribir={inscribirEventoAction.bind(null, slug, e.id)}
                        cancelar={cancelarEventoAction.bind(null, slug, e.id)}
                        anotar={anotarEsperaAction.bind(null, slug, "evento", e.id)}
                        salir={salirEsperaAction.bind(null, slug, "evento", e.id)}
                      />
                    ) : (
                      <span className="text-xs text-slate-400">Informativo</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
