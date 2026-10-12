import { redirect } from "next/navigation";

// Actividades y calendario se unificaron en la Agenda (vista Lista).
export default async function ActividadesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/c/${slug}/admin/agenda?vista=lista`);
}
