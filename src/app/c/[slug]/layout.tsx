import type { CSSProperties, ReactNode } from "react";
import { temaCssVars } from "@/lib/tema";
import { clubVisual } from "@/modules/clubs/visual";

// Aplica el tema del club de la URL. Cubre al admin general navegando un club ajeno en modo path;
// el acceso se sigue verificando en cada área con requireClub.
export default async function ClubLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const club = await clubVisual(slug);
  if (!club?.tema) return children;
  return <div style={temaCssVars(club.tema) as CSSProperties}>{children}</div>;
}
