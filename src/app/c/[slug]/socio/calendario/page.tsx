import { redirect } from "next/navigation";

// El calendario del socio pasó a su Agenda (vista Mes).
export default async function CalendarioSocioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { slug } = await params;
  const { mes } = await searchParams;
  redirect(`/c/${slug}/socio/agenda?vista=mes${mes ? `&mes=${encodeURIComponent(mes)}` : ""}`);
}
