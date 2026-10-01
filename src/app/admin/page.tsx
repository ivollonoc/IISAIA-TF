import Link from "next/link";
import { requireSuperadmin } from "@/lib/session";
import { listarClubs } from "@/server/clubs";
import { Aviso, Boton, Campo, Card, Tabla, Titulo, type SearchParams } from "@/components/ui";
import { crearClubAction } from "./actions";

export default async function AdminGeneralPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSuperadmin();
  const [clubs, msg] = await Promise.all([listarClubs(), searchParams]);

  return (
    <>
      <Titulo sub="Clubes afiliados a la plataforma">Admin general</Titulo>
      <Aviso {...msg} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={`Clubes (${clubs.length})`}>
            <Tabla headers={["Club", "URL", "Administrador", "Socios"]}>
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
