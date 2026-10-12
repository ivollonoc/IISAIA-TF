import { redirect } from "next/navigation";

// Actividades y calendario se unificaron en la Agenda (vista Mes).
export default async function CalendarioAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { slug } = await params;
  const { mes } = await searchParams;
  redirect(`/c/${slug}/admin/agenda?vista=mes${mes ? `&mes=${encodeURIComponent(mes)}` : ""}`);
}
