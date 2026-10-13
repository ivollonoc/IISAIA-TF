// Subdominio por club (solo con TENANT_MODE=subdomain): atlas.<ROOT_DOMAIN>/admin se reescribe a la
// ruta interna /c/atlas/admin. Con TENANT_MODE=path (default) no hace nada.
import { NextResponse, type NextRequest } from "next/server";
import { decidirRuta, hostDelPedido } from "@/lib/tenant";

export function middleware(req: NextRequest) {
  const root = process.env.ROOT_DOMAIN;
  if (process.env.TENANT_MODE !== "subdomain" || !root) return NextResponse.next();

  // x-forwarded-host primero: lo pone el proxy (Vercel, next dev) y lo conserva el fetch interno con
  // el que Next renderiza el redirect de un Server Action.
  const host = hostDelPedido(req.headers.get("x-forwarded-host"), req.headers.get("host"), root);
  const decision = decidirRuta(host, req.nextUrl.pathname, root, {
    navegacion: req.headers.get("sec-fetch-mode") === "navigate",
  });
  if (decision.accion === "reescribir") {
    const url = req.nextUrl.clone();
    url.pathname = decision.destino;
    return NextResponse.rewrite(url);
  }
  if (decision.accion === "redirigir") {
    // Destino absoluto (otro subdominio) o ruta del mismo host.
    const destino = decision.destino.startsWith("/") ? new URL(decision.destino, req.nextUrl).toString() : decision.destino;
    return NextResponse.redirect(`${destino}${req.nextUrl.search}`);
  }
  return NextResponse.next();
}

export const config = {
  // Todo menos los archivos estáticos de Next y los de /public con extensión.
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-z0-9]+$).*)"],
};
