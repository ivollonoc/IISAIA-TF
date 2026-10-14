import Link from "next/link";
import { requireSuperadmin } from "@/lib/session";
import { reporteGlobal } from "@/modules/reportes/service";
import { GraficoBarras } from "@/components/graficos";
import { Card, Stat, Tabla, Titulo } from "@/components/ui";

/** Reporte de la plataforma: actividad de los clubes, sin información de dinero. */
export default async function ReportesPlataformaPage({ searchParams }: { searchParams: Promise<{ meses?: string }> }) {
  await requireSuperadmin();
  const meses = (await searchParams).meses === "12" ? 12 : 6;
  const r = await reporteGlobal(meses);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <Titulo sub="Actividad de los clubes (sin información financiera)">Reportes</Titulo>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-sm">
          {[6, 12].map((m) => (
            <Link
              key={m}
              href={`/admin/reportes?meses=${m}`}
              className={`px-3 py-1.5 ${m === meses ? "bg-primario text-sobre-primario" : "bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {m} meses
            </Link>
          ))}
        </div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clubes" valor={r.totales.clubes} />
        <Stat label="Socios activos" valor={r.totales.sociosActivos} />
        <Stat label="Actividades" valor={r.totales.actividades} />
        <Stat label="Reservas (últimas 4 semanas)" valor={r.totales.reservas4Semanas} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Clubes">
          <Tabla headers={["Club", "Socios activos", "Actividades", "Reservas (4 sem.)"]}>
            {r.clubes.map((c) => (
              <tr key={c.slug}>
                <td className="py-2 pr-4 font-medium">{c.nombre}</td>
                <td className="py-2 pr-4">{c.sociosActivos}</td>
                <td className="py-2 pr-4">{c.actividades}</td>
                <td className="py-2 pr-4">{c.reservas4Semanas}</td>
              </tr>
            ))}
          </Tabla>
        </Card>
        <Card title="Altas de socios por mes (todos los clubes)">
          <GraficoBarras datos={r.altasPorMes} series={[{ clave: "altas", nombre: "Altas", color: "#047857" }]} />
        </Card>
      </div>
    </>
  );
}
