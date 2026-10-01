// Reglas de acceso puras (sin I/O) para poder testearlas aisladas.

export type Rol = "SUPERADMIN" | "ADMIN_CLUB" | "SOCIO";

export interface UsuarioSesion {
  id: string;
  email: string;
  rol: Rol;
  clubId: string | null;
  clubSlug: string | null;
  socioId: string | null;
}

export type AreaClub = "admin" | "socio";

/** ¿Puede el usuario entrar al área indicada del club `clubId`? */
export function puedeAcceder(user: UsuarioSesion, clubId: string, area: AreaClub): boolean {
  if (area === "admin") {
    if (user.rol === "SUPERADMIN") return true;
    return user.rol === "ADMIN_CLUB" && user.clubId === clubId;
  }
  return user.rol === "SOCIO" && user.clubId === clubId && user.socioId !== null;
}

/** Pantalla de inicio según el rol. */
export function homePath(user: UsuarioSesion): string {
  if (user.rol === "SUPERADMIN") return "/admin";
  if (!user.clubSlug) return "/sin-acceso";
  if (user.rol === "ADMIN_CLUB") return `/c/${user.clubSlug}/admin`;
  return user.socioId ? `/c/${user.clubSlug}/socio` : "/sin-acceso";
}
