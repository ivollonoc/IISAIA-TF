import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { requireClub } from "@/lib/session";
import { Tabs } from "@/components/Tabs";
import { urlClub } from "@/lib/tenant";

export default async function SocioLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club, user } = await requireClub(slug, "socio");
  const base = urlClub(slug, "/socio");
  // El titular de un grupo familiar tiene la pestaña Pagos (los cargos de todo el grupo).
  const familiares = await db.socio.count({ where: { clubId: club.id, titularId: user.socioId! } });

  return (
    <>
      <p className="mb-1 text-sm font-medium uppercase tracking-wide text-emerald-700">{club.nombre}</p>
      <Tabs
        items={[
          { href: base, label: "Mi cuenta" },
          ...(familiares > 0 ? [{ href: `${base}/pagos`, label: "Pagos del grupo" }] : []),
          { href: `${base}/actividades`, label: "Actividades y eventos" },
          { href: `${base}/calendario`, label: "Calendario" },
        ]}
      />
      {children}
    </>
  );
}
