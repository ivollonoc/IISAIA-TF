import Link from "next/link";
import { leerAviso } from "@/lib/aviso";
import { requireClub } from "@/lib/session";
import { agregarAlGrupoAction, quitarDelGrupoAction } from "@/modules/socios/actions";
import { resumenGrupos } from "@/modules/socios/grupos.service";
import { listarSocios } from "@/modules/socios/service";
import { Aviso, Boton, Card, Selector, Stat, Titulo, type SearchParams } from "@/components/ui";
import { urlClub } from "@/lib/tenant";

const nombre = (s: { nombre: string; apellido: string; nroSocio: number }) => `${s.nombre} ${s.apellido} (N° ${s.nroSocio})`;

export default async function GruposPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const [resumen, socios, msg] = await Promise.all([resumenGrupos(club.id), listarSocios(club.id), searchParams]);

  // Titular: cualquiera que no sea familiar de otro. A sumar: quien no está en ningún grupo.
  const titulares = new Set(resumen.lista.map((g) => g.titular.id));
  const posiblesTitulares = socios.filter((s) => !s.titularId && s.activo);
  const sinGrupo = socios.filter((s) => !s.titularId && !titulares.has(s.id) && s.activo);

  return (
    <>
      <Titulo sub="El titular de cada grupo paga los cargos de todos sus integrantes">Grupos familiares</Titulo>
      <Aviso {...leerAviso(msg)} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Grupos familiares" valor={resumen.grupos} />
        <Stat label="Socios en grupos" valor={resumen.sociosEnGrupos} />
        <Stat label="Integrantes por grupo (promedio)" valor={resumen.tamanioMedio.toLocaleString("es-AR")} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Grupos">
            {resumen.lista.length === 0 ? (
              <p className="text-sm text-slate-500">Todavía no hay grupos familiares.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {resumen.lista.map((g) => (
                  <li key={g.titular.id} className="py-3 text-sm">
                    <p>
                      <Link href={urlClub(slug, `/admin/socios/${g.titular.id}`)} className="font-semibold text-slate-800 hover:underline">
                        {nombre(g.titular)}
                      </Link>{" "}
                      <span className="text-xs text-primario-700">titular · {1 + g.familiares.length} integrantes</span>
                    </p>
                    <ul className="mt-1 flex flex-col gap-1 pl-4">
                      {g.familiares.map((f) => (
                        <li key={f.id} className="flex items-center justify-between gap-3">
                          <Link href={urlClub(slug, `/admin/socios/${f.id}`)} className="text-slate-600 hover:underline">
                            {nombre(f)}
                          </Link>
                          <form action={quitarDelGrupoAction.bind(null, slug, f.id)}>
                            <button className="text-xs text-red-700 hover:underline">Quitar del grupo</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Armar grupo">
          <form action={agregarAlGrupoAction.bind(null, slug)} className="flex flex-col gap-3">
            <Selector label="Titular (paga por el grupo)" name="titularId" defaultValue="" required>
              <option value="" disabled>
                Elegir…
              </option>
              {posiblesTitulares.map((s) => (
                <option key={s.id} value={s.id}>
                  {nombre(s)}
                  {titulares.has(s.id) ? " · ya es titular" : ""}
                </option>
              ))}
            </Selector>
            <Selector label="Integrante a sumar" name="socioId" defaultValue="" required>
              <option value="" disabled>
                Elegir…
              </option>
              {sinGrupo.map((s) => (
                <option key={s.id} value={s.id}>
                  {nombre(s)}
                </option>
              ))}
            </Selector>
            <Boton type="submit">Agregar al grupo</Boton>
            <p className="text-xs text-slate-500">
              Para sumar a otra persona al mismo grupo, volvé a elegir el mismo titular.
            </p>
          </form>
        </Card>
      </div>
    </>
  );
}
