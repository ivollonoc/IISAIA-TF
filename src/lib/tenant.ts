// Subdominio por club (TENANT_MODE=subdomain): atlas.clubdesocios.com.ar es la página del club y sus
// áreas viven en atlas.clubdesocios.com.ar/admin y /socio, que el middleware reescribe a las rutas
// internas /c/atlas/…. Funciones puras (sin I/O): `decidirRuta` la usa el middleware; `urlClub` y
// `urlVisible`, todos los links y redirecciones.

export type Tenant = { tipo: "raiz" } | { tipo: "club"; slug: string } | { tipo: "otro" };
export type Decision = { accion: "seguir" } | { accion: "reescribir"; destino: string } | { accion: "redirigir"; destino: string };
export type ConfigTenant = { modo: "path" | "subdomain"; root: string };

/** Rutas que no son de un club y se sirven igual en cualquier host. */
const COMPARTIDAS = ["/api", "/_next", "/avisos", "/ingresar", "/sin-acceso", "/login", "/favicon"];

/** Ruta interna de un club: /c/<slug>, /c/<slug>/… o /c/<slug>?… */
const RUTA_CLUB = /^\/c\/([a-z0-9-]+)([/?].*)?$/;

/** Modo y dominio raíz desde el entorno (next.config.ts los expone también al cliente). */
export function configTenant(): ConfigTenant {
  const root = process.env.ROOT_DOMAIN ?? "";
  return { modo: process.env.TENANT_MODE === "subdomain" && root ? "subdomain" : "path", root };
}

export function tenantDeHost(host: string | null, root: string): Tenant {
  if (!host) return { tipo: "otro" };
  const h = host.toLowerCase();
  const r = root.toLowerCase();
  if (h === r || h === `www.${r}`) return { tipo: "raiz" };
  if (h.endsWith(`.${r}`)) {
    const sub = h.slice(0, -(r.length + 1));
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(sub) ? { tipo: "club", slug: sub } : { tipo: "otro" };
  }
  return { tipo: "otro" };
}

const protocolo = (root: string) => (root.startsWith("localhost") ? "http" : "https");

/** URL de una sección del club (`ruta` = "/admin/socios", "?x=1" o ""): /c/<slug>… o su subdominio. */
export function urlClub(slug: string, ruta: string, cfg: ConfigTenant = configTenant()): string {
  if (cfg.modo === "path") return `/c/${slug}${ruta}`;
  return `${protocolo(cfg.root)}://${slug}.${cfg.root}${ruta.startsWith("/") ? ruta : `/${ruta}`}`;
}

/** URL de una ruta del dominio raíz (p. ej. el panel del admin general), absoluta con subdominios. */
export function urlRaiz(ruta: string, cfg: ConfigTenant = configTenant()): string {
  return cfg.modo === "path" ? ruta : `${protocolo(cfg.root)}://${cfg.root}${ruta}`;
}

/** Traduce una ruta interna (/c/<slug>/…) a la que ve el usuario; las demás quedan igual. */
export function urlVisible(ruta: string, cfg: ConfigTenant = configTenant()): string {
  const deClub = RUTA_CLUB.exec(ruta);
  return deClub ? urlClub(deClub[1], deClub[2] ?? "", cfg) : ruta;
}

/**
 * Qué hacer con un pedido en modo subdominio. `navegacion`: el navegador está cargando una página
 * (header sec-fetch-mode=navigate). Las rutas internas /c/<slug>/… solo se redirigen en una
 * navegación: Next renderiza el redirect de un Server Action con un fetch interno a esa ruta, y los
 * prefetch y links guardados también pueden traerla.
 */
export function decidirRuta(host: string | null, ruta: string, root: string, opciones: { navegacion?: boolean } = {}): Decision {
  const tenant = tenantDeHost(host, root);
  if (tenant.tipo === "otro") return { accion: "seguir" };
  const cfg: ConfigTenant = { modo: "subdomain", root };
  const deClub = RUTA_CLUB.exec(ruta);

  if (deClub) {
    return opciones.navegacion ? { accion: "redirigir", destino: urlClub(deClub[1], deClub[2] ?? "", cfg) } : { accion: "seguir" };
  }
  if (tenant.tipo === "raiz") return { accion: "seguir" };
  if (COMPARTIDAS.some((p) => ruta === p || ruta.startsWith(`${p}/`))) return { accion: "seguir" };
  return { accion: "reescribir", destino: ruta === "/" ? `/c/${tenant.slug}` : `/c/${tenant.slug}${ruta}` };
}

/**
 * Host con el que se resuelve el club: el primer valor de x-forwarded-host (lo pone el proxy y lo
 * conserva el fetch interno del redirect de un Server Action) si es del dominio; si no, `host`.
 */
export function hostDelPedido(forwarded: string | null, host: string | null, root: string): string | null {
  const primero = forwarded?.split(",")[0].trim() ?? null;
  return primero && tenantDeHost(primero, root).tipo !== "otro" ? primero : host;
}

/**
 * Botones de demo del login: en la página de un club, los de ese club; en la raíz, todos. Con
 * subdominios en localhost la sesión no se comparte entre subdominios, así que en la raíz solo
 * queda el admin general (los de club entran desde su subdominio).
 */
export function demosVisibles<T extends { club: string | null }>(demos: T[], club: string | undefined, cfg: ConfigTenant = configTenant()): T[] {
  if (club) return demos.filter((d) => d.club === club);
  const sinCookieCompartida = cfg.modo === "subdomain" && cfg.root.startsWith("localhost");
  return sinCookieCompartida ? demos.filter((d) => d.club === null) : demos;
}
