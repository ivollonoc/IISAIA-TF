import { requireClub } from "@/lib/session";
import { resumenClub } from "@/modules/cuenta-corriente/consultas.service";
import { formatPesos } from "@/lib/format";
import { Stat, Titulo } from "@/components/ui";

export default async function ResumenClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const r = await resumenClub(club.id);

  return (
    <>
      <Titulo sub={`Período ${r.periodo}`}>Resumen</Titulo>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Socios activos" valor={r.activos} />
        <Stat label="Al día" valor={r.alDia} />
        <Stat label="Morosos" valor={r.morosos} />
        <Stat label="Deuda vencida" valor={formatPesos(r.deudaVencida)} />
        <Stat label="Recaudado del mes" valor={formatPesos(r.recaudado)} />
        <Stat label="Actividades" valor={r.actividades} />
      </div>
    </>
  );
}
