import { describe, expect, it } from "vitest";
import { actividadSchema } from "@/modules/actividades/schema";
import { clubSchema, configClubSchema } from "@/modules/clubs/schema";
import { socioSchema } from "@/modules/socios/schema";

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

describe("actividadSchema", () => {
  it("acepta hora HH:MM y cupo positivo", () => {
    expect(actividadSchema.safeParse({ nombre: "Yoga", diaSemana: "6", hora: "10:00", cupo: "15" }).success).toBe(true);
  });

  it("rechaza hora inválida y cupo 0", () => {
    expect(actividadSchema.safeParse({ nombre: "Yoga", diaSemana: 6, hora: "25:00", cupo: 15 }).success).toBe(false);
    expect(actividadSchema.safeParse({ nombre: "Yoga", diaSemana: 6, hora: "10:00", cupo: 0 }).success).toBe(false);
  });

  it("el arancel es opcional (gratuita), se convierte desde texto y no puede ser negativo", () => {
    expect(actividadSchema.parse({ nombre: "Yoga", diaSemana: 6, hora: "10:00", cupo: 15 }).arancel).toBe(0);
    expect(actividadSchema.parse({ nombre: "Yoga", diaSemana: 6, hora: "10:00", cupo: 15, arancel: "5000" }).arancel).toBe(5000);
    expect(actividadSchema.safeParse({ nombre: "Yoga", diaSemana: 6, hora: "10:00", cupo: 15, arancel: -1 }).success).toBe(false);
  });
});

describe("configClubSchema", () => {
  it("acepta días de vencimiento de 1 a 28 (desde FormData)", () => {
    expect(configClubSchema.parse({ diaVencimiento: "1" }).diaVencimiento).toBe(1);
    expect(configClubSchema.parse({ diaVencimiento: "28" }).diaVencimiento).toBe(28);
  });

  it("rechaza 0 y 29", () => {
    expect(configClubSchema.safeParse({ diaVencimiento: 0 }).success).toBe(false);
    expect(configClubSchema.safeParse({ diaVencimiento: 29 }).success).toBe(false);
  });
});
