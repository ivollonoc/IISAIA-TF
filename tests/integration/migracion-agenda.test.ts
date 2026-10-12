import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// La base de test ya está migrada: acá se verifica que el traspaso de datos ocurra antes de
// borrar las columnas viejas (el traspaso real se probó a mano sobre una base con datos v2).
const sql = readFileSync("prisma/migrations/20261013090000_agenda/migration.sql", "utf8");

describe("migración agenda", () => {
  it("copia día, hora y duración a HorarioActividad antes de borrar las columnas", () => {
    const insert = sql.indexOf('INSERT INTO "HorarioActividad"');
    const drop = sql.indexOf('DROP COLUMN "diaSemana"');
    expect(insert).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(insert);
    expect(sql).toMatch(/SELECT[\s\S]*"diaSemana"[\s\S]*"hora"[\s\S]*"duracionMin"[\s\S]*FROM "Actividad"/);
  });

  it("toma la fecha de inicio del día de creación antes de exigirla", () => {
    const update = sql.indexOf('SET "fechaInicio"');
    const notNull = sql.indexOf('ALTER COLUMN "fechaInicio" SET NOT NULL');
    expect(update).toBeGreaterThan(-1);
    expect(notNull).toBeGreaterThan(update);
  });
});
