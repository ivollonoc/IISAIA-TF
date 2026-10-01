import { describe, expect, it } from "vitest";
import { actividadSchema, clubSchema, pagoSchema, socioSchema } from "@/lib/validation";

describe("clubSchema", () => {
  it("normaliza slug y email a minúsculas", () => {
    const r = clubSchema.parse({ nombre: "Club Norte", slug: "Club-Norte", adminEmail: "ADMIN@Norte.com" });
    expect(r.slug).toBe("club-norte");
    expect(r.adminEmail).toBe("admin@norte.com");
  });

  it("rechaza slugs con espacios o guiones al final", () => {
    expect(clubSchema.safeParse({ nombre: "Club", slug: "club norte", adminEmail: "a@b.com" }).success).toBe(false);
    expect(clubSchema.safeParse({ nombre: "Club", slug: "club-", adminEmail: "a@b.com" }).success).toBe(false);
  });
});

describe("socioSchema", () => {
  const valido = { nombre: "Ana", apellido: "Paz", dni: "30111222", email: "", tipoSocioId: "t1" };

  it("convierte email vacío en null", () => {
    expect(socioSchema.parse(valido).email).toBeNull();
  });

  it("rechaza DNI con letras o longitud inválida", () => {
    expect(socioSchema.safeParse({ ...valido, dni: "30A11222" }).success).toBe(false);
    expect(socioSchema.safeParse({ ...valido, dni: "123" }).success).toBe(false);
  });

  it("rechaza email mal formado", () => {
    expect(socioSchema.safeParse({ ...valido, email: "no-es-email" }).success).toBe(false);
  });
});

describe("pagoSchema", () => {
  it("convierte monto desde string (FormData)", () => {
    const r = pagoSchema.parse({ socioId: "s1", periodo: "2026-09", monto: "15000", medio: "EFECTIVO" });
    expect(r.monto).toBe(15000);
  });

  it("rechaza mes 13 y montos no positivos", () => {
    expect(pagoSchema.safeParse({ socioId: "s1", periodo: "2026-13", monto: 1, medio: "OTRO" }).success).toBe(false);
    expect(pagoSchema.safeParse({ socioId: "s1", periodo: "2026-09", monto: 0, medio: "OTRO" }).success).toBe(false);
  });
});

describe("actividadSchema", () => {
  it("acepta hora HH:MM y cupo positivo", () => {
    expect(actividadSchema.safeParse({ nombre: "Yoga", diaSemana: "6", hora: "10:00", cupo: "15" }).success).toBe(true);
  });

  it("rechaza hora inválida y cupo 0", () => {
    expect(actividadSchema.safeParse({ nombre: "Yoga", diaSemana: 6, hora: "25:00", cupo: 15 }).success).toBe(false);
    expect(actividadSchema.safeParse({ nombre: "Yoga", diaSemana: 6, hora: "10:00", cupo: 0 }).success).toBe(false);
  });
});
