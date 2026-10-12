import Link from "next/link";
import { leerAviso } from "@/lib/aviso";
import { requireSuperadmin } from "@/lib/session";
import { listarClubs } from "@/modules/clubs/service";
import { resumenPlataforma } from "@/modules/cuenta-corriente/consultas.service";
import { formatPesos } from "@/lib/format";
import { Aviso, Boton, Campo, Card, Stat, Tabla, Titulo, type SearchParams } from "@/components/ui";
import { crearClubAction } from "@/modules/clubs/actions";

export default async function AdminGeneralPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSuperadmin();
  const [clubs, resumen, msg] = await Promise.all([listarClubs(), resumenPlataforma(), searchParams]);

  return (
    <>
      <Titulo sub="Clubes afiliados a la plataforma">Admin general</Titulo>
      <Aviso {...leerAviso(msg)} />
      <Link href="/admin/avisos" className="mb-4 inline-block text-sm font-medium text-emerald-700 underline">
        Avisos a los clubes y buzón de salida →
      </Link>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label={`Cobrado ${resumen.periodo}`} valor={formatPesos(resumen.cobradoMes)} />
        <Stat label="Deuda vencida" valor={formatPesos(resumen.deudaVencida)} />
        <Stat label="Socios morosos" valor={resumen.sociosMorosos} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={`Clubes (${clubs.length})`}>
            <Tabla headers={["Club", "URL", "Administrador", "Socios", "Cobrado del mes", "Deuda vencida", ""]}>
              {clubs.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-4 font-medium">{c.nombre}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/c/${c.slug}/admin`} className="text-emerald-700 underline">
                      /c/{c.slug}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{c.usuarios.map((u) => u.email).join(", ") || "—"}</td>
                  <td className="py-2 pr-4">{c._count.socios}</td>
                  <td className="py-2 pr-4">{formatPesos(resumen.porClub[c.id]?.cobradoMes ?? 0)}</td>
                  <td className="py-2 pr-4">{formatPesos(resumen.porClub[c.id]?.deudaVencida ?? 0)}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/admin/clubs/${c.slug}/cuenta`} className="text-emerald-700 underline">
                      Ver cuenta
                    </Link>
                  </td>
                </tr>
              ))}
            </Tabla>
          </Card>
        </div>
        <Card title="Nuevo club">
          <form action={crearClubAction} className="flex flex-col gap-3">
            <Campo label="Nombre" name="nombre" required />
            <Campo label="Slug (URL)" name="slug" placeholder="club-atletico" required />
            <Campo label="Email del administrador" name="adminEmail" type="email" required />
            <Boton type="submit">Crear club</Boton>
          </form>
        </Card>
      </div>
    </>
  );
}
