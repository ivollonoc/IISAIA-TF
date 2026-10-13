// Resolución del club por subdominio (TENANT_MODE=subdomain): atlas.clubdesocios.com.ar muestra la
// página del club y sus secciones viven en atlas.clubdesocios.com.ar/c/atlas/…. Funciones puras (sin
// I/O), usadas por el middleware.

export type Tenant = { tipo: "raiz" } | { tipo: "club"; slug: string } | { tipo: "otro" };
export type Decision = { accion: "seguir" } | { accion: "reescribir"; destino: string } | { accion: "redirigir"; destino: string };

/** Rutas que no son de un club y se sirven igual en cualquier host. */
const COMPARTIDAS = ["/api", "/_next", "/avisos", "/ingresar", "/sin-acceso", "/login", "/favicon"];

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

/** URL de una sección del club según el modo: ruta (/c/<slug>/…) o subdominio. */
export function urlClub(slug: string, ruta: string, cfg: { modo: "path" | "subdomain"; root: string }): string {
  if (cfg.modo === "path") return `/c/${slug}${ruta}`;
  return `${protocolo(cfg.root)}://${slug}.${cfg.root}${ruta || "/"}`;
}

/**
 * Qué hacer con un pedido en modo subdominio. `navegacion`: el navegador está cargando una página
 * (header sec-fetch-mode=navigate). En el dominio raíz solo se redirigen esas: Next renderiza el
 * redirect de un Server Action con un fetch interno contra el origen del servidor (el dominio raíz)
 * y, si lo mandáramos a otro host, fetch descartaría la cookie de sesión.
 */
export function decidirRuta(host: string | null, ruta: string, root: string, opciones: { navegacion?: boolean } = {}): Decision {
  const tenant = tenantDeHost(host, root);
  if (tenant.tipo === "otro") return { accion: "seguir" };
  const deClub = /^\/c\/([a-z0-9-]+)(\/.*)?$/.exec(ruta);

  if (tenant.tipo === "raiz") {
    // /c/<slug>/… en el dominio raíz: la dirección canónica es el subdominio del club.
    if (!opciones.navegacion) return { accion: "seguir" };
    return deClub ? { accion: "redirigir", destino: urlClub(deClub[1], deClub[2] ?? "", { modo: "subdomain", root }) } : { accion: "seguir" };
  }
  if (deClub) {
    if (deClub[1] === tenant.slug) return { accion: "seguir" };
    return { accion: "redirigir", destino: urlClub(deClub[1], deClub[2] ?? "", { modo: "subdomain", root }) };
  }
  if (COMPARTIDAS.some((p) => ruta === p || ruta.startsWith(`${p}/`))) return { accion: "seguir" };
  // La portada del subdominio es la página pública del club; el resto de las rutas se redirige a
  // /c/<slug>/… en el mismo subdominio, que es como las arman los links y redirects de la app.
  if (ruta === "/") return { accion: "reescribir", destino: `/c/${tenant.slug}` };
  return { accion: "redirigir", destino: `/c/${tenant.slug}${ruta}` };
}
