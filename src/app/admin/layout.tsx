import type { ReactNode } from "react";
import { requireSuperadmin } from "@/lib/session";
import { Tabs } from "@/components/Tabs";

export default async function AdminGeneralLayout({ children }: { children: ReactNode }) {
  await requireSuperadmin();
  return (
    <>
      <p className="mb-1 text-sm font-medium uppercase tracking-wide text-emerald-700">Administración general</p>
      <Tabs
        items={[
          { href: "/admin", label: "Clubes" },
          { href: "/admin/avisos", label: "Avisos" },
          { href: "/admin/reportes", label: "Reportes" },
        ]}
      />
      {children}
    </>
  );
}
