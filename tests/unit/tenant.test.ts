import { describe, expect, it } from "vitest";
import { decidirRuta, tenantDeHost, urlClub, urlRaiz, urlVisible } from "@/lib/tenant";

const ROOT = "clubdesocios.com.ar";
const SUB = { modo: "subdomain", root: ROOT } as const;
const PATH = { modo: "path", root: ROOT } as const;
const nav = { navegacion: true };

describe("tenantDeHost", () => {
  it("distingue el dominio raíz (con o sin www y puerto) de un subdominio de club", () => {
    expect(tenantDeHost("clubdesocios.com.ar", ROOT)).toEqual({ tipo: "raiz" });
    expect(tenantDeHost("www.clubdesocios.com.ar", ROOT)).toEqual({ tipo: "raiz" });
    expect(tenantDeHost("Atlas.ClubDeSocios.com.ar", ROOT)).toEqual({ tipo: "club", slug: "atlas" });
    expect(tenantDeHost("demo.localhost:3000", "localhost:3000")).toEqual({ tipo: "club", slug: "demo" });
    expect(tenantDeHost("localhost:3000", "localhost:3000")).toEqual({ tipo: "raiz" });
  });

  it("otros hosts (previews de Vercel, IP) se tratan como externos", () => {
    expect(tenantDeHost("iisaia-tf-git-mvp3.vercel.app", ROOT)).toEqual({ tipo: "otro" });
    expect(tenantDeHost("a.b.clubdesocios.com.ar", ROOT)).toEqual({ tipo: "otro" });
    expect(tenantDeHost(null, ROOT)).toEqual({ tipo: "otro" });
  });
});

describe("decidirRuta (modo subdominio)", () => {
  it("en un subdominio las rutas limpias se reescriben a las internas del club", () => {
    expect(decidirRuta("atlas.clubdesocios.com.ar", "/", ROOT, nav)).toEqual({ accion: "reescribir", destino: "/c/atlas" });
    expect(decidirRuta("atlas.clubdesocios.com.ar", "/admin", ROOT, nav)).toEqual({ accion: "reescribir", destino: "/c/atlas/admin" });
    expect(decidirRuta("atlas.clubdesocios.com.ar", "/socio/actividades", ROOT)).toEqual({
      accion: "reescribir", destino: "/c/atlas/socio/actividades",
    });
  });

  it("deja pasar las rutas compartidas", () => {
    for (const ruta of ["/avisos", "/ingresar/abc", "/sin-acceso", "/login", "/api/auth/session"]) {
      expect(decidirRuta("atlas.clubdesocios.com.ar", ruta, ROOT, nav)).toEqual({ accion: "seguir" });
    }
  });

  it("navegar a /c/<slug>/… en el subdominio lleva a la URL limpia (del mismo club o del otro)", () => {
    expect(decidirRuta("atlas.clubdesocios.com.ar", "/c/atlas/admin", ROOT, nav)).toEqual({
      accion: "redirigir", destino: "https://atlas.clubdesocios.com.ar/admin",
    });
    expect(decidirRuta("atlas.clubdesocios.com.ar", "/c/demo/socio", ROOT, nav)).toEqual({
      accion: "redirigir", destino: "https://demo.clubdesocios.com.ar/socio",
    });
  });

  it("los pedidos internos a /c/<slug>/… (fetch del redirect de un Server Action) no se redirigen", () => {
    expect(decidirRuta("atlas.clubdesocios.com.ar", "/c/atlas/admin", ROOT)).toEqual({ accion: "seguir" });
  });

  it("en el dominio raíz, navegar a /c/<slug> redirige al subdominio del club; el resto sigue", () => {
    expect(decidirRuta("clubdesocios.com.ar", "/c/atlas/admin", ROOT, nav)).toEqual({
      accion: "redirigir", destino: "https://atlas.clubdesocios.com.ar/admin",
    });
    expect(decidirRuta("clubdesocios.com.ar", "/admin", ROOT, nav)).toEqual({ accion: "seguir" });
    expect(decidirRuta("localhost:3000", "/c/demo", "localhost:3000", nav)).toEqual({
      accion: "redirigir", destino: "http://demo.localhost:3000/",
    });
    expect(decidirRuta("localhost:3000", "/c/demo/socio", "localhost:3000")).toEqual({ accion: "seguir" });
  });

  it("los hosts externos (previews) siguen funcionando con rutas", () => {
    expect(decidirRuta("iisaia-tf.vercel.app", "/c/demo/admin", ROOT, nav)).toEqual({ accion: "seguir" });
    expect(decidirRuta("iisaia-tf.vercel.app", "/admin", ROOT, nav)).toEqual({ accion: "seguir" });
  });
});

describe("urlClub", () => {
  it("en modo ruta es /c/<slug>/…; en modo subdominio, la URL limpia del subdominio", () => {
    expect(urlClub("demo", "/socio", PATH)).toBe("/c/demo/socio");
    expect(urlClub("demo", "", PATH)).toBe("/c/demo");
    expect(urlClub("demo", "/socio?x=1", SUB)).toBe("https://demo.clubdesocios.com.ar/socio?x=1");
    expect(urlClub("demo", "", { modo: "subdomain", root: "localhost:3000" })).toBe("http://demo.localhost:3000/");
  });
});

describe("urlVisible", () => {
  it("traduce las rutas internas del club según el modo y deja igual las demás", () => {
    expect(urlVisible("/c/demo/admin/socios?ok=1", SUB)).toBe("https://demo.clubdesocios.com.ar/admin/socios?ok=1");
    expect(urlVisible("/c/demo", SUB)).toBe("https://demo.clubdesocios.com.ar/");
    expect(urlVisible("/c/demo?x=1", SUB)).toBe("https://demo.clubdesocios.com.ar/?x=1");
    expect(urlVisible("/c/demo/admin/socios?ok=1", PATH)).toBe("/c/demo/admin/socios?ok=1");
    expect(urlVisible("/admin", SUB)).toBe("/admin");
    expect(urlVisible("/avisos", SUB)).toBe("/avisos");
  });
});

describe("urlRaiz", () => {
  it("en modo subdominio es la URL absoluta del dominio raíz; en modo ruta, la ruta", () => {
    expect(urlRaiz("/admin", SUB)).toBe("https://clubdesocios.com.ar/admin");
    expect(urlRaiz("/", { modo: "subdomain", root: "localhost:3000" })).toBe("http://localhost:3000/");
    expect(urlRaiz("/admin", PATH)).toBe("/admin");
  });
});
