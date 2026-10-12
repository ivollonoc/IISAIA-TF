import { leerAviso } from "@/lib/aviso";
import { requireClub } from "@/lib/session";
import { formatDiaCorto, formatPesos } from "@/lib/format";
import { inicioDelDia } from "@/lib/periodo";
import { actividadesParaSocio } from "@/modules/actividades/service";
import { formatHorarios } from "@/modules/calendario/components/etiquetas";
import { eventosParaSocio } from "@/modules/calendario/eventos.service";
import { horaFin } from "@/modules/calendario/reglas";
import {
  anotarEsperaAction,
  cancelarActividadAction,
  cancelarEventoAction,
  inscribirActividadAction,
  inscribirEventoAction,
  salirEsperaAction,
} from "@/modules/calendario/socio.actions";
import { Aviso, Badge, Boton, Card, Tabla, Titulo, type SearchParams } from "@/components/ui";

/** Botón de la acción que corresponde: cancelar, inscribirse, anotarse o salir de la lista de espera. */
function AccionInscripcion({
  inscripto,
  enEspera,
  lleno,
  inscribir,
  cancelar,
  anotar,
  salir,
}: {
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
      <Boton>Inscribirme</Boton>
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
    actividadesParaSocio(club.id, socioId, ahora),
    eventosParaSocio(club.id, socioId, ahora),
    searchParams,
  ]);

  return (
    <>
      <Titulo sub="Inscribite a las actividades y eventos del club">Actividades y eventos</Titulo>
      <Aviso {...leerAviso(msg)} />
      <div className="flex flex-col gap-6">
        <Card title="Actividades">
          <Tabla headers={["Actividad", "Días y horarios", "Arancel", "Lugares", ""]}>
            {actividades.map((a) => {
              const lleno = a.inscriptos >= a.cupo;
              return (
                <tr key={a.id}>
                  <td className="py-2 pr-4">
                    <span className="font-medium">{a.nombre}</span>
                    {a.inscripto && (
                      <span className="ml-2">
                        <Badge ok>Inscripto</Badge>
                      </span>
                    )}
                    {a.descripcion && <p className="text-xs text-slate-500">{a.descripcion}</p>}
                  </td>
                  <td className="py-2 pr-4">{formatHorarios(a.horarios)}</td>
                  <td className="py-2 pr-4">{a.arancel > 0 ? `${formatPesos(a.arancel)}/mes` : "Gratis"}</td>
                  <td className="py-2 pr-4">{lleno ? "Completo" : `${a.cupo - a.inscriptos} de ${a.cupo}`}</td>
                  <td className="py-2 text-right">
                    <AccionInscripcion
                      inscripto={a.inscripto}
                      enEspera={a.enEspera}
                      lleno={lleno}
                      inscribir={inscribirActividadAction.bind(null, slug, a.id)}
                      cancelar={cancelarActividadAction.bind(null, slug, a.id)}
                      anotar={anotarEsperaAction.bind(null, slug, "actividad", a.id)}
                      salir={salirEsperaAction.bind(null, slug, "actividad", a.id)}
                    />
                  </td>
                </tr>
              );
            })}
          </Tabla>
        </Card>

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
                        {e.actividad && ` · Para inscriptos de ${e.actividad.nombre}`}
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
