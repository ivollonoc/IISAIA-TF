import type { ReactNode } from "react";
import { requireClub } from "@/lib/session";
import { Tabs } from "@/components/Tabs";

export default async function AdminClubLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const base = `/c/${slug}/admin`;

  return (
    <>
      <p className="mb-1 text-sm font-medium uppercase tracking-wide text-emerald-700">{club.nombre}</p>
      <Tabs
        items={[
          { href: base, label: "Resumen" },
          { href: `${base}/socios`, label: "Socios" },
          { href: `${base}/tipos`, label: "Tipos de socio" },
          { href: `${base}/actividades`, label: "Actividades" },
        ]}
      />
      {children}
    </>
  );
}
