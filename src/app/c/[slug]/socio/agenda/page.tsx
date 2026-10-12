import { redirect } from "next/navigation";

// La Agenda del socio se separó en "Actividades y eventos" y "Calendario".
export default async function AgendaSocioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/c/${slug}/socio/actividades`);
}
