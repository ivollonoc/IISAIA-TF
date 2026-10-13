import { requireClub } from "@/lib/session";
import { inicioDelDia } from "@/lib/periodo";
import { CalendarioMes } from "@/modules/calendario/components/CalendarioMes";
import { CalendarioSemana } from "@/modules/calendario/components/CalendarioSemana";
import { NavegacionMesAgenda, NavegacionSemana, SelectorVista } from "@/modules/calendario/components/Navegacion";
import { parsearDia, semanaDe, semanasDelMes } from "@/modules/calendario/reglas";
import { calendarioSocio } from "@/modules/calendario/service";
import { vistaDeParams } from "@/modules/calendario/vista";
import { Card, Titulo } from "@/components/ui";
import { urlClub } from "@/lib/tenant";

export default async function CalendarioSocioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ vista?: string; semana?: string; mes?: string }>;
}) {
  const { slug } = await params;
  const { club, user } = await requireClub(slug, "socio");
  const sp = await searchParams;
  const ahora = new Date();
  const hoy = inicioDelDia(ahora);
  const v = vistaDeParams({ ...sp, vista: sp.vista === "mes" ? "mes" : "semana" }, ahora);
  const base = urlClub(slug, "/socio/calendario");

  const dias = semanaDe(parsearDia(v.semana)!);
  const semanas = semanasDelMes(v.mes);
  const [desde, hasta] = v.vista === "semana" ? [dias[0], dias[6]] : [semanas[0][0], semanas.at(-1)![6]];
  const items = await calendarioSocio(club.id, user.socioId!, desde, hasta);

  return (
    <>
      <Titulo sub="Tus clases y los eventos del club">Calendario</Titulo>
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SelectorVista base={base} v={v} vistas={["semana", "mes"]} />
          {v.vista === "semana" ? <NavegacionSemana base={base} v={v} hoy={hoy} /> : <NavegacionMesAgenda base={base} v={v} />}
        </div>
        {v.vista === "semana" ? (
          <CalendarioSemana dias={dias} items={items} hoy={hoy} />
        ) : (
          <CalendarioMes periodo={v.mes} items={items} hoy={hoy} />
        )}
      </Card>
    </>
  );
}
