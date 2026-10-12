import { leerAviso } from "@/lib/aviso";
import { requireClub } from "@/lib/session";
import { cuentaClub } from "@/modules/cuenta-corriente/consultas.service";
import { periodosGenerables } from "@/modules/cuenta-corriente/reglas";
import { Aviso, Boton, Card, Selector, Titulo, type SearchParams } from "@/components/ui";
import { generarCargosAction } from "@/modules/cuenta-corriente/actions";
import { CuentaClub } from "@/modules/cuenta-corriente/components/CuentaClub";

export default async function CuentaClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const [cuenta, msg] = await Promise.all([cuentaClub(club.id), searchParams]);
  const [actual, siguiente] = periodosGenerables();

  return (
    <>
      <Titulo sub="Cobros acreditados y deuda de los socios">Cuenta corriente</Titulo>
      <Aviso {...leerAviso(msg)} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CuentaClub cuenta={cuenta} />
        </div>
        <Card title="Generar cargos">
          <form action={generarCargosAction.bind(null, slug)} className="flex flex-col gap-3">
            <Selector label="Período" name="periodo" defaultValue={actual}>
              <option value={actual}>{actual} (actual)</option>
              <option value={siguiente}>{siguiente} (siguiente)</option>
            </Selector>
            <p className="text-sm text-slate-500">
              Crea la cuota social de cada socio activo y el arancel de sus actividades. Vencen el día{" "}
              {club.diaVencimiento}. Si ya existen, no se duplican.
            </p>
            <Boton type="submit">Generar cargos</Boton>
          </form>
        </Card>
      </div>
    </>
  );
}
