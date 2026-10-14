// Identidad visual del club (nombre, escudo y tema) para el layout y el Header. Datos públicos.
import { headers } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { getUsuario } from "@/lib/session";
import { parseTema } from "@/lib/tema";
import { configTenant, hostDelPedido, tenantDeHost } from "@/lib/tenant";

/** Nombre, logo y tema validado del club (null si no existe). Cacheado por pedido. */
export const clubVisual = cache(async (slug: string) => {
  const club = await db.club.findUnique({ where: { slug }, select: { slug: true, nombre: true, logoUrl: true, tema: true } });
  if (!club) return null;
  return { slug: club.slug, nombre: club.nombre, logoUrl: club.logoUrl, tema: parseTema(club.tema) };
});

/**
 * Club con cuyos colores se pinta la app: el del subdominio (TENANT_MODE=subdomain) y, si no hay,
 * el del usuario. Las rutas /c/<slug> en modo path las cubre el layout de c/[slug].
 */
export const clubDelPedido = cache(async () => {
  const cfg = configTenant();
  if (cfg.modo === "subdomain") {
    const h = await headers();
    const tenant = tenantDeHost(hostDelPedido(h.get("x-forwarded-host"), h.get("host"), cfg.root), cfg.root);
    if (tenant.tipo === "club") return clubVisual(tenant.slug);
  }
  const user = await getUsuario();
  return user?.clubSlug ? clubVisual(user.clubSlug) : null;
});
