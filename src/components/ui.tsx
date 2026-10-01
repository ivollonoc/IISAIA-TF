// Componentes de presentación mínimos (sin estado), estilados con Tailwind.
import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, ButtonHTMLAttributes } from "react";

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {title && <h2 className="mb-4 text-lg font-semibold text-slate-800">{title}</h2>}
      {children}
    </section>
  );
}

export function Titulo({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-slate-900">{children}</h1>
      {sub && <p className="text-slate-500">{sub}</p>}
    </div>
  );
}

const variantes = {
  primario: "bg-emerald-700 text-white hover:bg-emerald-800",
  secundario: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  peligro: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
};

export function Boton({
  variante = "primario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: keyof typeof variantes }) {
  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${variantes[variante]} ${className}`}
      {...props}
    />
  );
}

export function Campo({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input className="rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-600 focus:outline-none" {...props} />
    </label>
  );
}

export function Selector({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <select className="rounded-lg border border-slate-300 bg-white px-3 py-2" {...props}>
        {children}
      </select>
    </label>
  );
}

export function Badge({ ok, children }: { ok: boolean; children: ReactNode }) {
  const color = ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>{children}</span>;
}

/** Muestra el resultado del último Server Action (?ok / ?error). */
export function Aviso({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>;
  if (ok) return <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Cambios guardados</p>;
  return null;
}

export function Tabla({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr>{headers.map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Stat({ label, valor }: { label: string; valor: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{valor}</p>
    </div>
  );
}

export type SearchParams = Promise<{ error?: string; ok?: string }>;
