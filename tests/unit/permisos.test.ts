import { describe, expect, it } from "vitest";
import { homePath, puedeAcceder, type UsuarioSesion } from "@/lib/permisos";

const usuario = (over: Partial<UsuarioSesion>): UsuarioSesion => ({
  id: "u1",
  email: "x@x.com",
  rol: "SOCIO",
  clubId: "club-a",
  clubSlug: "club-a",
  socioId: "s1",
  ...over,
});

describe("puedeAcceder (aislamiento multi-tenant)", () => {
  it("el superadmin entra al admin de cualquier club", () => {
    expect(puedeAcceder(usuario({ rol: "SUPERADMIN", clubId: null }), "club-b", "admin")).toBe(true);
  });

  it("el admin de club solo entra a su propio club", () => {
    const admin = usuario({ rol: "ADMIN_CLUB", socioId: null });
    expect(puedeAcceder(admin, "club-a", "admin")).toBe(true);
    expect(puedeAcceder(admin, "club-b", "admin")).toBe(false);
  });

  it("un socio no entra al área de administración", () => {
    expect(puedeAcceder(usuario({}), "club-a", "admin")).toBe(false);
  });

  it("un socio solo ve el área socio de su club", () => {
    expect(puedeAcceder(usuario({}), "club-a", "socio")).toBe(true);
    expect(puedeAcceder(usuario({}), "club-b", "socio")).toBe(false);
  });

  it("un usuario SOCIO sin ficha de socio no accede", () => {
    expect(puedeAcceder(usuario({ socioId: null }), "club-a", "socio")).toBe(false);
  });
});

describe("homePath", () => {
  it("deriva según rol", () => {
    expect(homePath(usuario({ rol: "SUPERADMIN" }))).toBe("/admin");
    expect(homePath(usuario({ rol: "ADMIN_CLUB" }))).toBe("/c/club-a/admin");
    expect(homePath(usuario({}))).toBe("/c/club-a/socio");
  });

  it("sin club o sin ficha de socio va a /sin-acceso (evita loops)", () => {
    expect(homePath(usuario({ rol: "ADMIN_CLUB", clubSlug: null }))).toBe("/sin-acceso");
    expect(homePath(usuario({ socioId: null }))).toBe("/sin-acceso");
  });
});
