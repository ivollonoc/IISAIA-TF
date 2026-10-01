import { requireClub } from "@/lib/session";
import { listarActividades } from "@/server/actividades";
import { DIAS } from "@/lib/format";
import { Aviso, Boton, Campo, Card, Selector, Tabla, Titulo, type SearchParams } from "@/components/ui";
import { crearActividadAction } from "../actions";

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
      <Titulo sub="Calendario semanal con cupos">Actividades</Titulo>
      <Aviso {...msg} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <Tabla headers={["Actividad", "Día", "Hora", "Inscriptos / cupo"]}>
              {actividades.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 pr-4 font-medium">{a.nombre}</td>
                  <td className="py-2 pr-4">{DIAS[a.diaSemana]}</td>
                  <td className="py-2 pr-4">{a.hora}</td>
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
            <Boton type="submit">Crear</Boton>
          </form>
        </Card>
      </div>
    </>
  );
}
