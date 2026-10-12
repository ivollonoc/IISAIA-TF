import Link from "next/link";
import { leerAviso } from "@/lib/aviso";
import { requireClub } from "@/lib/session";
import { obtenerSocio } from "@/modules/socios/service";
import { actividadesParaSocio } from "@/modules/actividades/service";
import { cuentaSocio } from "@/modules/cuenta-corriente/consultas.service";
import { formatDia, formatPesos } from "@/lib/format";
import { formatHorarios } from "@/modules/calendario/components/etiquetas";
import { Aviso, Badge, Boton, Card, Tabla, Titulo, type SearchParams } from "@/components/ui";
import { cancelarAction, inscribirAction } from "@/modules/actividades/actions";
import { BotonPagarSeleccion } from "@/modules/cuenta-corriente/components/BotonPagarSeleccion";
import { MovimientosTabla } from "@/modules/cuenta-corriente/components/MovimientosTabla";
import { DIA_MS, inicioDelDia } from "@/lib/periodo";
import { AgendaLista } from "@/modules/calendario/components/AgendaLista";
import { calendarioSocio } from "@/modules/calendario/service";

export default async function SocioHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { club, user } = await requireClub(slug, "socio");
  const hoy = inicioDelDia();
  const [socio, actividades, cuenta, agenda, msg] = await Promise.all([
    obtenerSocio(club.id, user.socioId!),
    actividadesParaSocio(club.id, user.socioId!),
    cuentaSocio(club.id, user.socioId!),
    calendarioSocio(club.id, user.socioId!, hoy, new Date(hoy.getTime() + 6 * DIA_MS)),
    searchParams,
  ]);

  return (
    <>
      <p className="mb-1 text-sm font-medium uppercase tracking-wide text-emerald-700">{club.nombre}</p>
      <Titulo sub={`Socio N° ${socio.nroSocio} · ${socio.tipoSocio.nombre}`}>Hola, {socio.nombre}</Titulo>
      <Aviso {...leerAviso(msg)} />

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
          {cuenta.pendientes.length > 0 && (
            <Link
              href={`/c/${slug}/socio/pagar?${cuenta.pendientes.map((c) => `cargos=${c.id}`).join("&")}`}
              className="mt-3 inline-block rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Pagar {formatPesos(cuenta.deuda)}
            </Link>
          )}
          <p className="mt-2 text-sm text-slate-500">Cuota mensual: {formatPesos(socio.tipoSocio.cuotaMensual)}</p>
        </Card>

        <div className="lg:col-span-2">
          <Card title="Actividades">
            <Tabla headers={["Actividad", "Horario", "Arancel", "Cupo", ""]}>
              {actividades.map((a) => {
                const lleno = a.inscriptos >= a.cupo;
                return (
                  <tr key={a.id}>
                    <td className="py-2 pr-4 font-medium">{a.nombre}</td>
                    <td className="py-2 pr-4">
                      {formatHorarios(a.horarios)}
                    </td>
                    <td className="py-2 pr-4">{a.arancel > 0 ? `${formatPesos(a.arancel)}/mes` : "Gratis"}</td>
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
          <Card title="Próximos 7 días">
            <AgendaLista items={agenda} vacio="No tenés clases ni eventos en los próximos 7 días." />
            <Link href={`/c/${slug}/socio/calendario`} className="mt-4 inline-block text-sm text-emerald-700 underline">
              Ver calendario
            </Link>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card title="Cuenta corriente">
            <form action={`/c/${slug}/socio/pagar`} method="get" className="flex flex-col gap-4">
              <MovimientosTabla movimientos={cuenta.movimientos} seleccion="cargos" />
              {cuenta.pendientes.length > 0 && (
                <div>
                  <BotonPagarSeleccion name="cargos" />
                </div>
              )}
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
