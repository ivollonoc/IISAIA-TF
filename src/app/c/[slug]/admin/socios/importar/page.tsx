import Link from "next/link";
import { requireClub } from "@/lib/session";
import { listarTipos } from "@/modules/cuotas/tipos.service";
import { ImportarSocios } from "@/modules/socios/components/ImportarSocios";
import { Card, Titulo } from "@/components/ui";

export default async function ImportarSociosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const tipos = await listarTipos(club.id);

  return (
    <>
      <Link href={`/c/${slug}/admin/socios`} className="mb-2 inline-block text-sm text-emerald-700 underline">
        ← Volver a socios
      </Link>
      <Titulo sub="Alta masiva desde una planilla (por ejemplo, exportada de Excel como CSV)">Importar socios</Titulo>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <ImportarSocios slug={slug} />
          </Card>
        </div>
        <Card title="Formato">
          <div className="flex flex-col gap-2 text-sm text-slate-600">
            <p>Una fila por socio, con estas columnas (en cualquier orden; separadas por coma o punto y coma):</p>
            <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              {"nombre,apellido,dni,email,telefono,tipo\nAna,Paz,30111222,ana@mail.com,+54 11 5555-0001,Activo\nBeto,Gil,40222333,,,Cadete"}
            </pre>
            <p>Email y teléfono son opcionales. Hasta 500 socios por archivo; si alguna fila tiene errores no se importa ninguna.</p>
            <p>Tipos de socio del club: {tipos.map((t) => t.nombre).join(", ") || "todavía no hay (crealos en Tipos de socio)"}.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
