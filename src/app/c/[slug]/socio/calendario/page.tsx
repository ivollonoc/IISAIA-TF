import Link from "next/link";
import { requireClub } from "@/lib/session";
import { inicioDelDia } from "@/lib/periodo";
import { CalendarioMes } from "@/modules/calendario/components/CalendarioMes";
import { NavegacionMes } from "@/modules/calendario/components/NavegacionMes";
import { mesDeParam, semanasDelMes } from "@/modules/calendario/reglas";
import { calendarioSocio } from "@/modules/calendario/service";
import { Card, Titulo } from "@/components/ui";

export default async function CalendarioSocioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { slug } = await params;
  const { club, user } = await requireClub(slug, "socio");
  const periodo = mesDeParam((await searchParams).mes);
  const semanas = semanasDelMes(periodo);
  const items = await calendarioSocio(club.id, user.socioId!, semanas[0][0], semanas.at(-1)![6]);

  return (
    <>
      <p className="mb-1 text-sm font-medium uppercase tracking-wide text-emerald-700">{club.nombre}</p>
      <Titulo sub="Tus clases y los eventos del club">Calendario</Titulo>
      <Link href={`/c/${slug}/socio`} className="mb-4 inline-block text-sm text-emerald-700 underline">
        ← Volver a mi cuenta
      </Link>
      <Card>
        <NavegacionMes periodo={periodo} base={`/c/${slug}/socio/calendario`} />
        <CalendarioMes periodo={periodo} items={items} hoy={inicioDelDia()} />
      </Card>
    </>
  );
}
