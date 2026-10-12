import { leerAviso } from "@/lib/aviso";
import { requireClub } from "@/lib/session";
import { listarActividades } from "@/modules/actividades/service";
import { DIAS, formatPesos } from "@/lib/format";
import { Aviso, Boton, Campo, Card, Selector, Tabla, Titulo, type SearchParams } from "@/components/ui";
import { crearActividadAction } from "@/modules/actividades/actions";

export default async function ActividadesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const [actividades, msg] = await Promise.all([listarActividades(club.id), searchParams]);

  return (
    <>
      <Titulo sub="Calendario semanal con cupos y aranceles">Actividades</Titulo>
      <Aviso {...leerAviso(msg)} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <Tabla headers={["Actividad", "Día", "Hora", "Arancel", "Inscriptos / cupo"]}>
              {actividades.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 pr-4 font-medium">{a.nombre}</td>
                  <td className="py-2 pr-4">{DIAS[a.diaSemana]}</td>
                  <td className="py-2 pr-4">{a.hora}</td>
                  <td className="py-2 pr-4">{a.arancel > 0 ? `${formatPesos(a.arancel)}/mes` : "Gratis"}</td>
                  <td className="py-2 pr-4">
                    {a._count.inscripciones} / {a.cupo}
                  </td>
                </tr>
              ))}
            </Tabla>
          </Card>
        </div>
        <Card title="Nueva actividad">
          <form action={crearActividadAction.bind(null, slug)} className="flex flex-col gap-3">
            <Campo label="Nombre" name="nombre" required />
            <Selector label="Día" name="diaSemana" defaultValue="1">
              {DIAS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </Selector>
            <Campo label="Hora" name="hora" type="time" required />
            <Campo label="Cupo" name="cupo" type="number" min={1} required />
            <Campo label="Arancel mensual ($, 0 = gratis)" name="arancel" type="number" min={0} defaultValue={0} />
            <Boton type="submit">Crear</Boton>
          </form>
        </Card>
      </div>
    </>
  );
}
