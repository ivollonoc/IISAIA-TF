import Link from "next/link";
import { leerAviso } from "@/lib/aviso";
import { requireClub } from "@/lib/session";
import { listarSocios } from "@/modules/socios/service";
import { listarTipos } from "@/modules/cuotas/tipos.service";
import { estadoSocios } from "@/modules/cuenta-corriente/consultas.service";
import { formatPesos } from "@/lib/format";
import { Aviso, Badge, Card, Tabla, Titulo, type SearchParams } from "@/components/ui";
import { crearSocioAction } from "@/modules/socios/actions";
import { SocioForm } from "@/modules/socios/components/SocioForm";

export default async function SociosPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const [socios, tipos, estados, msg] = await Promise.all([
    listarSocios(club.id),
    listarTipos(club.id),
    estadoSocios(club.id),
    searchParams,
  ]);

  return (
    <>
      <Titulo sub="Altas, modificaciones y estado de cuenta">Socios</Titulo>
      <Aviso {...leerAviso(msg)} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={`Padrón (${socios.length})`}>
            <Tabla headers={["N°", "Socio", "DNI", "Tipo", "Cuenta", "Deuda", "Estado"]}>
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
                    <Badge ok={!estados[s.id]?.moroso}>{estados[s.id]?.moroso ? "Moroso" : "Al día"}</Badge>
                  </td>
                  <td className="py-2 pr-4">{formatPesos(estados[s.id]?.deuda ?? 0)}</td>
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
