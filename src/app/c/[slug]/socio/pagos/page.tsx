import { redirect } from "next/navigation";
import { requireClub } from "@/lib/session";
import { formatDia, formatPesos } from "@/lib/format";
import { BotonPagarSeleccion } from "@/modules/cuenta-corriente/components/BotonPagarSeleccion";
import { pendientesDelGrupo } from "@/modules/socios/grupos.service";
import { Badge, Card, Tabla, Titulo } from "@/components/ui";

/** Pestaña del titular: cargos pendientes de todo su grupo familiar, para pagarlos juntos. */
export default async function PagosGrupoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { club, user } = await requireClub(slug, "socio");
  const { integrantes, pendientes, total } = await pendientesDelGrupo(club.id, user.socioId!);
  if (integrantes.length < 2) redirect(`/c/${slug}/socio`);

  return (
    <>
      <Titulo sub={`Grupo: ${integrantes.map((s) => s.nombre).join(", ")}`}>Pagos del grupo</Titulo>
      <Card>
        {pendientes.length === 0 ? (
          <p className="text-sm text-slate-500">Tu grupo no tiene cargos pendientes. ¡Están todos al día!</p>
        ) : (
          <form action={`/c/${slug}/socio/pagar`} method="get" className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              Total pendiente del grupo: <strong>{formatPesos(total)}</strong>. Elegí qué cargos pagar.
            </p>
            <Tabla headers={["✓", "Socio", "Concepto", "Vence", "Monto", "Estado"]}>
              {pendientes.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-2">
                    <input type="checkbox" name="cargos" value={c.id} data-monto={c.monto} defaultChecked aria-label={`Seleccionar ${c.descripcion}`} />
                  </td>
                  <td className="py-2 pr-4">
                    {c.socio.nombre} {c.socio.apellido}
                  </td>
                  <td className="py-2 pr-4">{c.descripcion}</td>
                  <td className="py-2 pr-4">{formatDia(c.vencimiento)}</td>
                  <td className="py-2 pr-4">{formatPesos(c.monto)}</td>
                  <td className="py-2 pr-4">
                    <Badge ok={!c.vencido}>{c.vencido ? "Vencido" : "Pendiente"}</Badge>
                  </td>
                </tr>
              ))}
            </Tabla>
            <div>
              <BotonPagarSeleccion name="cargos" />
            </div>
          </form>
        )}
      </Card>
    </>
  );
}
