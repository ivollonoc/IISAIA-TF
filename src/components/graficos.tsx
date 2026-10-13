"use client";

// Gráficos de barras de los reportes (Recharts, al estilo de Tremor: ejes livianos, grilla
// horizontal y leyenda arriba). Los colores salen de la paleta de la app.
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface Serie {
  clave: string;
  nombre: string;
  color: string;
}

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const compacto = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** "2026-10" → "oct 26". */
const etiquetaPeriodo = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(2, 4)}`;

export function GraficoBarras({
  datos,
  series,
  formato = "numero",
  alto = 260,
}: {
  datos: ({ periodo: string } & Record<string, number | string>)[];
  series: Serie[];
  formato?: "pesos" | "numero";
  alto?: number;
}) {
  const fmt = (v: number) => (formato === "pesos" ? pesos.format(v) : String(v));
  return (
    <div style={{ height: alto }} className="w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="periodo" tickFormatter={etiquetaPeriodo} tickLine={false} axisLine={false} stroke="#64748b" />
          <YAxis
            tickFormatter={(v: number) => (formato === "pesos" ? `$${compacto.format(v)}` : String(v))}
            tickLine={false}
            axisLine={false}
            stroke="#64748b"
            width={formato === "pesos" ? 56 : 32}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(v) => fmt(Number(v))}
            labelFormatter={(p) => etiquetaPeriodo(String(p))}
            cursor={{ fill: "#f1f5f9" }}
            contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 12 }}
          />
          <Legend verticalAlign="top" align="right" iconType="circle" height={28} />
          {series.map((s) => (
            <Bar key={s.clave} dataKey={s.clave} name={s.nombre} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
