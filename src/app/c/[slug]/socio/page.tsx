import { requireClub } from "@/lib/session";
import { obtenerSocio } from "@/server/socios";
import { actividadesParaSocio } from "@/server/actividades";
import { estaAlDia, periodoActual } from "@/lib/periodo";
import { DIAS, formatFecha, formatPesos } from "@/lib/format";
import { Aviso, Badge, Boton, Card, Tabla, Titulo, type SearchParams } from "@/components/ui";
import { cancelarAction, inscribirAction } from "./actions";

export default async function SocioHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { club, user } = await requireClub(slug, "socio");
  const [socio, actividades, msg] = await Promise.all([
    obtenerSocio(club.id, user.socioId!),
    actividadesParaSocio(club.id, user.socioId!),
    searchParams,
  ]);
  const alDia = estaAlDia(socio.pagos.map((p) => p.periodo));

  return (
    <>
      <p className="mb-1 text-sm font-medium uppercase tracking-wide text-emerald-700">{club.nombre}</p>
      <Titulo sub={`Socio N° ${socio.nroSocio} · ${socio.tipoSocio.nombre}`}>Hola, {socio.nombre}</Titulo>
      <Aviso {...msg} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Mi cuota">
          <p className="mb-2">
            <Badge ok={alDia}>{alDia ? "Al día" : "Pendiente"}</Badge>{" "}
            <span className="text-sm text-slate-500">período {periodoActual()}</span>
          </p>
          <p className="text-sm text-slate-600">Cuota mensual: {formatPesos(socio.tipoSocio.cuotaMensual)}</p>
          {!alDia && (
            <p className="mt-3 text-sm text-slate-500">
              El pago online llega en la próxima versión. Por ahora, abonás en secretaría o por transferencia.
            </p>
          )}
        </Card>

        <div className="lg:col-span-2">
          <Card title="Actividades">
            <Tabla headers={["Actividad", "Horario", "Cupo", ""]}>
              {actividades.map((a) => {
                const lleno = a.inscriptos >= a.cupo;
                return (
                  <tr key={a.id}>
                    <td className="py-2 pr-4 font-medium">{a.nombre}</td>
                    <td className="py-2 pr-4">
                      {DIAS[a.diaSemana]} {a.hora}
                    </td>
                    <td className="py-2 pr-4">
                      {a.inscriptos} / {a.cupo}
                    </td>
                    <td className="py-2 text-right">
                      {a.inscripto ? (
                        <form action={cancelarAction.bind(null, slug, a.id)}>
                          <Boton variante="peligro">Cancelar</Boton>
                        </form>
                      ) : (
                        <form action={inscribirAction.bind(null, slug, a.id)}>
                          <Boton disabled={lleno} className="disabled:opacity-40">
                            {lleno ? "Sin cupo" : "Inscribirme"}
                          </Boton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Tabla>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card title="Mis pagos">
            <Tabla headers={["Período", "Monto", "Medio", "Fecha"]}>
              {socio.pagos.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-4">{p.periodo}</td>
                  <td className="py-2 pr-4">{formatPesos(p.monto)}</td>
                  <td className="py-2 pr-4">{p.medio.toLowerCase()}</td>
                  <td className="py-2 pr-4">{formatFecha(p.fecha)}</td>
                </tr>
              ))}
            </Tabla>
          </Card>
        </div>
      </div>
    </>
  );
}
