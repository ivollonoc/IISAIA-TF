import { notFound } from "next/navigation";
import { requireClub } from "@/lib/session";
import { obtenerSocio } from "@/server/socios";
import { listarTipos } from "@/server/tipos";
import { DomainError } from "@/lib/errors";
import { periodoActual } from "@/lib/periodo";
import { formatFecha, formatPesos } from "@/lib/format";
import { Aviso, Boton, Campo, Card, Selector, Tabla, Titulo, type SearchParams } from "@/components/ui";
import { actualizarSocioAction, cambiarEstadoSocioAction, registrarPagoAction } from "../../actions";
import { SocioForm } from "../SocioForm";

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
  const [tipos, msg] = await Promise.all([listarTipos(club.id), searchParams]);

  return (
    <>
      <Titulo sub={`Socio N° ${socio.nroSocio} · ${socio.activo ? "Activo" : "Dado de baja"}`}>
        {socio.apellido}, {socio.nombre}
      </Titulo>
      <Aviso {...msg} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Datos">
          <SocioForm action={actualizarSocioAction.bind(null, slug, socio.id)} tipos={tipos} socio={socio} />
          <form action={cambiarEstadoSocioAction.bind(null, slug, socio.id, !socio.activo)} className="mt-4">
            <Boton variante={socio.activo ? "peligro" : "secundario"} className="w-full">
              {socio.activo ? "Dar de baja" : "Reactivar"}
            </Boton>
          </form>
        </Card>

        <Card title="Registrar pago">
          <form action={registrarPagoAction.bind(null, slug, socio.id)} className="flex flex-col gap-3">
            <Campo label="Período (YYYY-MM)" name="periodo" defaultValue={periodoActual()} required />
            <Campo label="Monto ($)" name="monto" type="number" defaultValue={socio.tipoSocio.cuotaMensual} required />
            <Selector label="Medio" name="medio" defaultValue="EFECTIVO">
              <option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="OTRO">Otro</option>
            </Selector>
            <Boton type="submit">Registrar</Boton>
          </form>
        </Card>

        <Card title="Historial de pagos">
          <Tabla headers={["Período", "Monto", "Fecha"]}>
            {socio.pagos.map((p) => (
              <tr key={p.id}>
                <td className="py-2 pr-4">{p.periodo}</td>
                <td className="py-2 pr-4">{formatPesos(p.monto)}</td>
                <td className="py-2 pr-4">{formatFecha(p.fecha)}</td>
              </tr>
            ))}
          </Tabla>
          {socio.pagos.length === 0 && <p className="mt-2 text-sm text-slate-500">Sin pagos registrados.</p>}
        </Card>
      </div>
    </>
  );
}
