import { describe, expect, it } from "vitest";
import { decidirRuta, tenantDeHost, urlClub } from "@/lib/tenant";

const ROOT = "clubdesocios.com.ar";

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
  it("en un subdominio la portada muestra la página del club; las demás rutas van a /c/<slug>/… en el mismo subdominio", () => {
    expect(decidirRuta("atlas.clubdesocios.com.ar", "/", ROOT)).toEqual({ accion: "reescribir", destino: "/c/atlas" });
    expect(decidirRuta("atlas.clubdesocios.com.ar", "/socio/actividades", ROOT)).toEqual({
      accion: "redirigir", destino: "/c/atlas/socio/actividades",
    });
  });

  it("deja pasar las rutas que ya traen el club correcto y las compartidas", () => {
    expect(decidirRuta("atlas.clubdesocios.com.ar", "/c/atlas/admin", ROOT)).toEqual({ accion: "seguir" });
    for (const ruta of ["/avisos", "/ingresar/abc", "/sin-acceso", "/api/auth/session"]) {
      expect(decidirRuta("atlas.clubdesocios.com.ar", ruta, ROOT)).toEqual({ accion: "seguir" });
    }
  });

  it("un subdominio con el club de otro en la ruta va al subdominio de ese club", () => {
    expect(decidirRuta("atlas.clubdesocios.com.ar", "/c/demo/socio", ROOT)).toEqual({
      accion: "redirigir", destino: "https://demo.clubdesocios.com.ar/socio",
    });
  });

  it("en el dominio raíz, navegar a /c/<slug> redirige al subdominio del club; el resto sigue", () => {
    const nav = { navegacion: true };
    expect(decidirRuta("clubdesocios.com.ar", "/c/atlas/admin", ROOT, nav)).toEqual({
      accion: "redirigir", destino: "https://atlas.clubdesocios.com.ar/admin",
    });
    expect(decidirRuta("clubdesocios.com.ar", "/admin", ROOT, nav)).toEqual({ accion: "seguir" });
    expect(decidirRuta("demo.localhost:3000", "/", "localhost:3000")).toEqual({ accion: "reescribir", destino: "/c/demo" });
    expect(decidirRuta("localhost:3000", "/c/demo", "localhost:3000", nav)).toEqual({
      accion: "redirigir", destino: "http://demo.localhost:3000/",
    });
  });

  it("en el dominio raíz, los pedidos que no son navegación (el fetch interno del redirect de un Server Action) no se redirigen", () => {
    expect(decidirRuta("localhost:3000", "/c/demo/socio", "localhost:3000")).toEqual({ accion: "seguir" });
    expect(decidirRuta("localhost:3000", "/c/demo/socio", "localhost:3000", { navegacion: false })).toEqual({ accion: "seguir" });
  });

  it("los hosts externos (previews) siguen funcionando con rutas", () => {
    expect(decidirRuta("iisaia-tf.vercel.app", "/c/demo/admin", ROOT)).toEqual({ accion: "seguir" });
  });
});

describe("urlClub", () => {
  it("en modo ruta es /c/<slug>/…; en modo subdominio, la URL del subdominio", () => {
    expect(urlClub("demo", "/socio", { modo: "path", root: ROOT })).toBe("/c/demo/socio");
    expect(urlClub("demo", "", { modo: "path", root: ROOT })).toBe("/c/demo");
    expect(urlClub("demo", "/socio", { modo: "subdomain", root: ROOT })).toBe("https://demo.clubdesocios.com.ar/socio");
    expect(urlClub("demo", "", { modo: "subdomain", root: "localhost:3000" })).toBe("http://demo.localhost:3000/");
  });
});
