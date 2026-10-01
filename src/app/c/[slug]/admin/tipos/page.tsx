import { requireClub } from "@/lib/session";
import { listarTipos } from "@/server/tipos";
import { formatPesos } from "@/lib/format";
import { Aviso, Boton, Campo, Card, Tabla, Titulo, type SearchParams } from "@/components/ui";
import { crearTipoAction } from "../actions";

export default async function TiposPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const [tipos, msg] = await Promise.all([listarTipos(club.id), searchParams]);

  return (
    <>
      <Titulo sub="Categorías de socio y su cuota mensual">Tipos de socio</Titulo>
      <Aviso {...msg} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <Tabla headers={["Tipo", "Cuota mensual", "Socios"]}>
              {tipos.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 pr-4 font-medium">{t.nombre}</td>
                  <td className="py-2 pr-4">{formatPesos(t.cuotaMensual)}</td>
                  <td className="py-2 pr-4">{t._count.socios}</td>
                </tr>
              ))}
            </Tabla>
          </Card>
        </div>
        <Card title="Nuevo tipo">
          <form action={crearTipoAction.bind(null, slug)} className="flex flex-col gap-3">
            <Campo label="Nombre" name="nombre" placeholder="Activo, Cadete, Vitalicio…" required />
            <Campo label="Cuota mensual ($)" name="cuotaMensual" type="number" min={0} required />
            <Boton type="submit">Agregar</Boton>
          </form>
        </Card>
      </div>
    </>
  );
}
