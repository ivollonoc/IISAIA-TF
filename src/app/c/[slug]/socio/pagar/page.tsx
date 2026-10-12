import Link from "next/link";
import { requireClub } from "@/lib/session";
import { mensajeDeError } from "@/lib/errors";
import { formatDia, formatPesos } from "@/lib/format";
import { Aviso, Boton, Campo, Card, Tabla, Titulo } from "@/components/ui";
import { prepararCheckout } from "@/modules/pagos-online/checkout.service";
import { pagarAction } from "@/modules/pagos-online/actions";
import { TARJETAS_DE_PRUEBA } from "@/modules/pagos-online/simulada";

export default async function PagarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cargos?: string | string[]; error?: string }>;
}) {
  const { slug } = await params;
  const { club, user } = await requireClub(slug, "socio");
  const sp = await searchParams;
  const ids = ([] as string[]).concat(sp.cargos ?? []);

  let checkout: Awaited<ReturnType<typeof prepararCheckout>> | null = null;
  let error = sp.error;
  try {
    checkout = await prepararCheckout(club.id, user.socioId!, ids);
  } catch (e) {
    const msg = mensajeDeError(e);
    if (msg === null) throw e;
    error ??= msg;
  }

  return (
    <>
      <p className="mb-1 text-sm font-medium uppercase tracking-wide text-emerald-700">{club.nombre}</p>
      <Titulo sub="Pago online con tarjeta">Pagar</Titulo>
      <Aviso error={error} />
      {checkout ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Detalle">
            <Tabla headers={["Concepto", "Vence", "Monto"]}>
              {checkout.cargos.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-4">{c.descripcion}</td>
                  <td className="py-2 pr-4">{formatDia(c.vencimiento)}</td>
                  <td className="py-2 pr-4">{formatPesos(c.monto)}</td>
                </tr>
              ))}
            </Tabla>
            <p className="mt-4 text-right text-lg font-bold text-slate-900">Total {formatPesos(checkout.total)}</p>
          </Card>
          <Card title="Tarjeta">
            <form action={pagarAction.bind(null, slug, checkout.cargos.map((c) => c.id))} className="flex flex-col gap-3">
              <Campo label="Número" name="numero" inputMode="numeric" placeholder="4000 0000 0000 0001" required />
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Vencimiento (MM/AA)" name="vencimiento" placeholder="12/30" required />
                <Campo label="CVV" name="cvv" inputMode="numeric" required />
              </div>
              <Campo label="Titular" name="titular" required />
              <Boton type="submit">Pagar {formatPesos(checkout.total)}</Boton>
            </form>
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              <p className="font-medium text-slate-700">Modo de prueba</p>
              <ul className="mt-1 list-disc pl-5">
                {TARJETAS_DE_PRUEBA.map((t) => (
                  <li key={t.numero}>
                    <code>{t.numero}</code> — {t.resultado}
                  </li>
                ))}
              </ul>
              <p className="mt-1">Cualquier vencimiento futuro y CVV de 3 dígitos.</p>
            </div>
          </Card>
        </div>
      ) : (
        <Link href={`/c/${slug}/socio`} className="text-emerald-700 underline">
          Volver a mi cuenta
        </Link>
      )}
    </>
  );
}
