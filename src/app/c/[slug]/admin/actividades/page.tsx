import { redirect } from "next/navigation";
import { urlClub } from "@/lib/tenant";

// Actividades y calendario se unificaron en la Agenda (vista Lista).
export default async function ActividadesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(urlClub(slug, "/admin/agenda?vista=lista"));
}
