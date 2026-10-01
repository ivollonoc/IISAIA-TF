import Link from "next/link";
import { requireClub } from "@/lib/session";
import { listarSocios } from "@/server/socios";
import { listarTipos } from "@/server/tipos";
import { Aviso, Badge, Card, Tabla, Titulo, type SearchParams } from "@/components/ui";
import { crearSocioAction } from "../actions";
import { SocioForm } from "./SocioForm";

export default async function SociosPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const [socios, tipos, msg] = await Promise.all([listarSocios(club.id), listarTipos(club.id), searchParams]);

  return (
    <>
      <Titulo sub="Altas, modificaciones y estado de cuota del mes">Socios</Titulo>
      <Aviso {...msg} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={`Padrón (${socios.length})`}>
            <Tabla headers={["N°", "Socio", "DNI", "Tipo", "Cuota del mes", "Estado"]}>
              {socios.map((s) => (
                <tr key={s.id} className={s.activo ? "" : "opacity-50"}>
                  <td className="py-2 pr-4">{s.nroSocio}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/c/${slug}/admin/socios/${s.id}`} className="font-medium text-emerald-700 underline">
                      {s.apellido}, {s.nombre}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{s.dni}</td>
                  <td className="py-2 pr-4">{s.tipoSocio.nombre}</td>
                  <td className="py-2 pr-4">
                    <Badge ok={s.pagos.length > 0}>{s.pagos.length > 0 ? "Al día" : "Pendiente"}</Badge>
                  </td>
                  <td className="py-2 pr-4">{s.activo ? "Activo" : "Baja"}</td>
                </tr>
              ))}
            </Tabla>
          </Card>
        </div>
        <Card title="Alta de socio">
          {tipos.length === 0 ? (
            <p className="text-sm text-slate-500">
              Primero creá un{" "}
              <Link href={`/c/${slug}/admin/tipos`} className="text-emerald-700 underline">
                tipo de socio
              </Link>
              .
            </p>
          ) : (
            <SocioForm action={crearSocioAction.bind(null, slug)} tipos={tipos} />
          )}
        </Card>
      </div>
    </>
  );
}
