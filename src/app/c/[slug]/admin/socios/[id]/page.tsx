import { notFound } from "next/navigation";
import { leerAviso } from "@/lib/aviso";
import { requireClub } from "@/lib/session";
import { obtenerSocio } from "@/modules/socios/service";
import { listarTipos } from "@/modules/cuotas/tipos.service";
import { cuentaSocio } from "@/modules/cuenta-corriente/consultas.service";
import { DomainError } from "@/lib/errors";
import { formatDia, formatPesos } from "@/lib/format";
import { Aviso, Badge, Boton, Campo, Card, Selector, Titulo, type SearchParams } from "@/components/ui";
import { anularCargoAction, registrarPagoAction } from "@/modules/cuenta-corriente/actions";
import { MovimientosTabla } from "@/modules/cuenta-corriente/components/MovimientosTabla";
import { actualizarSocioAction, cambiarEstadoSocioAction } from "@/modules/socios/actions";
import { SocioForm } from "@/modules/socios/components/SocioForm";

export default async function SocioDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: SearchParams;
}) {
  const { slug, id } = await params;
  const { club } = await requireClub(slug, "admin");
  const socio = await obtenerSocio(club.id, id).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const [tipos, cuenta, msg] = await Promise.all([listarTipos(club.id), cuentaSocio(club.id, socio.id), searchParams]);

  return (
    <>
      <Titulo sub={`Socio N° ${socio.nroSocio} · ${socio.activo ? "Activo" : "Dado de baja"}`}>
        {socio.apellido}, {socio.nombre}
      </Titulo>
      <Aviso {...leerAviso(msg)} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Datos">
          <SocioForm action={actualizarSocioAction.bind(null, slug, socio.id)} tipos={tipos} socio={socio} />
          <form action={cambiarEstadoSocioAction.bind(null, slug, socio.id, !socio.activo)} className="mt-4">
            <Boton variante={socio.activo ? "peligro" : "secundario"} className="w-full">
              {socio.activo ? "Dar de baja" : "Reactivar"}
            </Boton>
          </form>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Cuenta corriente">
            <p className="mb-4 text-sm text-slate-600">
              <Badge ok={cuenta.alDia}>{cuenta.alDia ? "Al día" : "Con deuda vencida"}</Badge> Deuda:{" "}
              <strong>{formatPesos(cuenta.deuda)}</strong> · Vencida: {formatPesos(cuenta.deudaVencida)}
            </p>
            <form action={registrarPagoAction.bind(null, slug, socio.id)} className="flex flex-col gap-4">
              <MovimientosTabla movimientos={cuenta.movimientos} seleccion="cargoIds" />
              {cuenta.pendientes.length > 0 && (
                <div className="flex flex-wrap items-end gap-3">
                  <Selector label="Medio" name="medio" defaultValue="EFECTIVO">
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="OTRO">Otro</option>
                  </Selector>
                  <Boton type="submit">Registrar pago de los cargos tildados</Boton>
                </div>
              )}
            </form>
          </Card>
          {cuenta.pendientes.length > 0 && (
            <Card title="Anular cargos pendientes">
              <ul className="flex flex-col gap-3">
                {cuenta.pendientes.map((c) => (
                  <li key={c.id}>
                    <form
                      action={anularCargoAction.bind(null, slug, socio.id, c.id)}
                      className="flex flex-wrap items-end gap-3"
                    >
                      <span className="min-w-48 text-sm">
                        {c.descripcion} · {formatPesos(c.monto)} · vence {formatDia(c.vencimiento)}
                      </span>
                      <Campo label="Motivo" name="motivo" required />
                      <Boton variante="peligro">Anular</Boton>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
