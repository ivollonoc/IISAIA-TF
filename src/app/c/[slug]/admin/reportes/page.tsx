import Link from "next/link";
import { requireClub } from "@/lib/session";
import { formatPesos } from "@/lib/format";
import { reporteClub } from "@/modules/reportes/service";
import { GraficoBarras } from "@/components/graficos";
import { Card, Stat, Tabla, Titulo } from "@/components/ui";
import { urlClub } from "@/lib/tenant";

const VERDE = "#047857";
const GRIS = "#94a3b8";
const AMBAR = "#d97706";

/** "4,5 ★" o "—" sin votos. */
const estrellas = (n: number, votos: number) => (votos ? `${n.toLocaleString("es-AR")} ★` : "—");

export default async function ReportesClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ meses?: string }>;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const meses = (await searchParams).meses === "12" ? 12 : 6;
  const r = await reporteClub(club.id, meses);
  const base = urlClub(slug, "/admin/reportes");

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <Titulo sub={`Últimos ${meses} meses`}>Reportes</Titulo>
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-sm">
          {[6, 12].map((m) => (
            <Link
              key={m}
              href={`${base}?meses=${m}`}
              className={`px-3 py-1.5 ${m === meses ? "bg-primario text-sobre-primario" : "bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {m} meses
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Socios activos" valor={r.kpis.activos} />
        <Stat label="Recaudado este mes" valor={formatPesos(r.kpis.recaudadoMes)} />
        <Stat label="Deuda vencida" valor={formatPesos(r.kpis.deudaVencida)} />
        <Stat label="Socios al día" valor={`${r.kpis.porcentajeAlDia}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Recaudación por mes">
          <p className="mb-2 text-xs text-slate-500">Emitido: cargos del período (sin anulados). Cobrado: pagos recibidos en el mes.</p>
          <GraficoBarras
            datos={r.recaudacion}
            formato="pesos"
            series={[
              { clave: "emitido", nombre: "Emitido", color: GRIS },
              { clave: "cobrado", nombre: "Cobrado", color: VERDE },
            ]}
          />
        </Card>

        <Card title="Altas y bajas de socios">
          <GraficoBarras
            datos={r.altasBajas}
            series={[
              { clave: "altas", nombre: "Altas", color: VERDE },
              { clave: "bajas", nombre: "Bajas", color: AMBAR },
            ]}
          />
        </Card>

        <Card title="Ocupación de las clases (últimas 4 semanas)">
          {r.ocupacion.length === 0 ? (
            <p className="text-sm text-slate-500">No hay actividades activas.</p>
          ) : (
            <ul className="flex flex-col gap-3 text-sm">
              {r.ocupacion.map((o) => (
                <li key={o.actividadId}>
                  <div className="mb-1 flex justify-between gap-3">
                    <span className="font-medium text-slate-800">{o.actividad}</span>
                    <span className="text-slate-500">
                      {o.porcentaje}% · {o.reservas} de {o.lugares} lugares en {o.clases} clases
                      {o.enEspera > 0 && <span className="text-amber-700"> · {o.enEspera} en espera</span>}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Ocupación ${o.porcentaje}%`}>
                    <div className="h-full rounded-full bg-primario-600" style={{ width: `${Math.min(o.porcentaje, 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Puntaje de las actividades">
          <Tabla headers={["Actividad", "Promedio", "Votos"]}>
            {r.puntajes.map((p) => (
              <tr key={p.actividad}>
                <td className="py-2 pr-4 font-medium">{p.actividad}</td>
                <td className="py-2 pr-4 text-amber-700">{estrellas(p.promedio, p.votos)}</td>
                <td className="py-2 pr-4">{p.votos}</td>
              </tr>
            ))}
          </Tabla>
        </Card>

        <div className="lg:col-span-2">
          <Card title="Socios con deuda vencida">
            {r.morosos.length === 0 ? (
              <p className="text-sm text-slate-500">No hay socios con deuda vencida.</p>
            ) : (
              <Tabla headers={["Socio", "Deuda vencida"]}>
                {r.morosos.map((m) => (
                  <tr key={m.socioId}>
                    <td className="py-2 pr-4">
                      <Link href={urlClub(slug, `/admin/socios/${m.socioId}`)} className="text-primario-700 hover:underline">
                        {m.apellido}, {m.nombre}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 font-medium text-red-700">{formatPesos(m.deudaVencida)}</td>
                  </tr>
                ))}
              </Tabla>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
