import Link from "next/link";

/** Navegación secundaria entre secciones de un área. */
export function Tabs({ items }: { items: { href: string; label: string }[] }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-emerald-600"
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
