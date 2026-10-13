import Link from "next/link";
import { leerAviso } from "@/lib/aviso";
import { requireClub } from "@/lib/session";
import { obtenerSocio } from "@/modules/socios/service";
import { cuentaSocio } from "@/modules/cuenta-corriente/consultas.service";
import { formatDia, formatPesos } from "@/lib/format";
import { formatHorarios } from "@/modules/calendario/components/etiquetas";
import { Aviso, Badge, Card, Titulo, type SearchParams } from "@/components/ui";
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
  const ahora = new Date();
  const hoy = inicioDelDia(ahora);
  const [socio, cuenta, agenda, msg] = await Promise.all([
    obtenerSocio(club.id, user.socioId!),
    cuentaSocio(club.id, user.socioId!),
    calendarioSocio(club.id, user.socioId!, hoy, new Date(hoy.getTime() + 6 * DIA_MS)),
    searchParams,
  ]);

  return (
    <>
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
          {socio.titular ? (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Tus pagos los hace el titular de tu grupo familiar, {socio.titular.nombre} {socio.titular.apellido}.
            </p>
          ) : socio._count.familiares > 0 ? (
            <Link
              href={`/c/${slug}/socio/pagos`}
              className="mt-3 inline-block rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Pagar los cargos del grupo
            </Link>
          ) : cuenta.pendientes.length > 0 && (
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
          <Card title="Próximos 7 días">
            <AgendaLista items={agenda} vacio="No tenés clases reservadas ni eventos en los próximos 7 días." />
            <Link href={`/c/${slug}/socio/calendario`} className="mt-4 inline-block text-sm text-emerald-700 underline">
              Ver calendario
            </Link>{" "}
            <Link href={`/c/${slug}/socio/actividades`} className="mt-4 ml-3 inline-block text-sm text-emerald-700 underline">
              Reservar clases
            </Link>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card title="Cuenta corriente">
            <form action={`/c/${slug}/socio/pagar`} method="get" className="flex flex-col gap-4">
              <MovimientosTabla movimientos={cuenta.movimientos} seleccion={socio.titular ? undefined : "cargos"} />
              {cuenta.pendientes.length > 0 && !socio.titular && (
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
