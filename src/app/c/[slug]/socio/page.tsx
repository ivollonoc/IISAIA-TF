import { requireClub } from "@/lib/session";
import { obtenerSocio } from "@/modules/socios/service";
import { actividadesParaSocio } from "@/modules/actividades/service";
import { cuentaSocio } from "@/modules/cuenta-corriente/consultas.service";
import { DIAS, formatDia, formatPesos } from "@/lib/format";
import { Aviso, Badge, Boton, Card, Tabla, Titulo, type SearchParams } from "@/components/ui";
import { cancelarAction, inscribirAction } from "@/modules/actividades/actions";
import { MovimientosTabla } from "@/modules/cuenta-corriente/components/MovimientosTabla";

export default async function SocioHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { club, user } = await requireClub(slug, "socio");
  const [socio, actividades, cuenta, msg] = await Promise.all([
    obtenerSocio(club.id, user.socioId!),
    actividadesParaSocio(club.id, user.socioId!),
    cuentaSocio(club.id, user.socioId!),
    searchParams,
  ]);

  return (
    <>
      <p className="mb-1 text-sm font-medium uppercase tracking-wide text-emerald-700">{club.nombre}</p>
      <Titulo sub={`Socio N° ${socio.nroSocio} · ${socio.tipoSocio.nombre}`}>Hola, {socio.nombre}</Titulo>
      <Aviso {...msg} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Mi cuenta">
          <p className="mb-2">
            <Badge ok={cuenta.alDia}>{cuenta.alDia ? "Al día" : "Con deuda vencida"}</Badge>
          </p>
          <p className="text-sm text-slate-600">
            Saldo pendiente: <strong>{formatPesos(cuenta.deuda)}</strong>
          </p>
          {cuenta.deudaVencida > 0 && (
            <p className="text-sm text-red-700">Vencido: {formatPesos(cuenta.deudaVencida)}</p>
          )}
          {cuenta.proximoVencimiento && (
            <p className="text-sm text-slate-600">Próximo vencimiento: {formatDia(cuenta.proximoVencimiento)}</p>
          )}
          <p className="mt-2 text-sm text-slate-500">Cuota mensual: {formatPesos(socio.tipoSocio.cuotaMensual)}</p>
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
          <Card title="Cuenta corriente">
            <MovimientosTabla movimientos={cuenta.movimientos} />
          </Card>
        </div>
      </div>
    </>
  );
}
