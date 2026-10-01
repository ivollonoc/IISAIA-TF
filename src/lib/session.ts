// Guards de servidor para páginas y Server Actions.
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "./auth";
import { db } from "./db";
import { puedeAcceder, type AreaClub, type UsuarioSesion } from "./permisos";

export async function getUsuario(): Promise<UsuarioSesion | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ? (session.user as UsuarioSesion) : null;
}

export async function requireUsuario(): Promise<UsuarioSesion> {
  const user = await getUsuario();
  if (!user) redirect("/login");
  return user;
}

export async function requireSuperadmin(): Promise<UsuarioSesion> {
  const user = await requireUsuario();
  if (user.rol !== "SUPERADMIN") redirect("/");
  return user;
}

/** Resuelve el club por slug y verifica acceso al área. Base del aislamiento multi-tenant. */
export async function requireClub(slug: string, area: AreaClub) {
  const user = await requireUsuario();
  const club = await db.club.findUnique({ where: { slug } });
  if (!club) notFound();
  if (!puedeAcceder(user, club.id, area)) redirect("/sin-acceso");
  return { user, club };
}
