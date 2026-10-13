import type { ReactNode } from "react";
import { requireClub } from "@/lib/session";
import { Tabs } from "@/components/Tabs";
import { urlClub } from "@/lib/tenant";

export default async function AdminClubLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const base = urlClub(slug, "/admin");

  return (
    <>
      <p className="mb-1 text-sm font-medium uppercase tracking-wide text-emerald-700">{club.nombre}</p>
      <Tabs
        items={[
          { href: base, label: "Resumen" },
          { href: `${base}/socios`, label: "Socios" },
          { href: `${base}/grupos`, label: "Grupos familiares" },
          { href: `${base}/cuenta`, label: "Cuenta corriente" },
          { href: `${base}/tipos`, label: "Tipos de socio" },
          { href: `${base}/agenda`, label: "Agenda" },
          { href: `${base}/avisos`, label: "Avisos" },
          { href: `${base}/reportes`, label: "Reportes" },
        ]}
      />
      {children}
    </>
  );
}
