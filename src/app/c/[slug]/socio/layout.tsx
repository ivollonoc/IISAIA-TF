import type { ReactNode } from "react";
import { requireClub } from "@/lib/session";
import { Tabs } from "@/components/Tabs";

export default async function SocioLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "socio");
  const base = `/c/${slug}/socio`;

  return (
    <>
      <p className="mb-1 text-sm font-medium uppercase tracking-wide text-emerald-700">{club.nombre}</p>
      <Tabs
        items={[
          { href: base, label: "Mi cuenta" },
          { href: `${base}/agenda`, label: "Agenda" },
        ]}
      />
      {children}
    </>
  );
}
