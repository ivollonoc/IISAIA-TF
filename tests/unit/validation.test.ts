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
  const base = { nombre: "Yoga", cupo: "15", fechaInicio: "2026-10-01" };
  const conHorario = { ...base, h_0_dia: "1", h_0_hora: "10:00" };
  const errores = (input: object) => {
    const r = actividadSchema.safeParse(input);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it("arma los horarios desde los renglones del formulario (h_N_dia, h_N_hora, h_N_dur)", () => {
    const r = actividadSchema.parse({
      ...base, h_0_dia: "1", h_0_hora: "09:00", h_0_dur: "90", h_3_dia: "1", h_3_hora: "17:00", h_3_dur: "", h_7_dia: "3", h_7_hora: "19:00",
    });
    expect(r.horarios).toEqual([
      { diaSemana: 1, hora: "09:00", duracionMin: 90 },
      { diaSemana: 1, hora: "17:00", duracionMin: 60 },
      { diaSemana: 3, hora: "19:00", duracionMin: 60 },
    ]);
    expect(r.fechaInicio).toEqual(new Date(Date.UTC(2026, 9, 1)));
    expect(r.fechaFin).toBeNull();
    expect(r.descripcion).toBeNull();
  });

  it("acepta los horarios como lista", () => {
    const r = actividadSchema.parse({ ...base, horarios: [{ diaSemana: 6, hora: "10:00" }] });
    expect(r.horarios).toEqual([{ diaSemana: 6, hora: "10:00", duracionMin: 60 }]);
  });

  it("exige al menos un horario, sin repetir día y hora, y con horas válidas", () => {
    expect(errores(base)).toContain("Agregá al menos un horario");
    expect(errores({ ...base, horarios: [{ diaSemana: 1, hora: "10:00" }, { diaSemana: 1, hora: "10:00" }] })).toContain(
      "Hay un horario repetido",
    );
    expect(actividadSchema.safeParse({ ...base, h_0_dia: "1", h_0_hora: "25:00" }).success).toBe(false);
    expect(actividadSchema.safeParse({ ...conHorario, h_0_dur: "10" }).success).toBe(false);
  });

  it("rechaza cupo 0, arancel negativo y fin anterior al inicio", () => {
    expect(actividadSchema.safeParse({ ...conHorario, cupo: 0 }).success).toBe(false);
    expect(actividadSchema.safeParse({ ...conHorario, arancel: -1 }).success).toBe(false);
    expect(errores({ ...conHorario, fechaFin: "2026-09-30" })).toContain("La fecha de fin no puede ser anterior al inicio");
    expect(actividadSchema.parse({ ...conHorario, fechaFin: "2026-10-01" }).fechaFin).toEqual(new Date(Date.UTC(2026, 9, 1)));
  });

  it("el arancel es opcional (gratuita) y se convierte desde texto", () => {
    expect(actividadSchema.parse(conHorario).arancel).toBe(0);
    expect(actividadSchema.parse({ ...conHorario, arancel: "5000" }).arancel).toBe(5000);
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
