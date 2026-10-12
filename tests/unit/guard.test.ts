import { describe, expect, it } from "vitest";
import { assertTestDb, assertTestEnv } from "../helpers/guard";

describe("assertTestDb (los tests de integración solo tocan bases *_test)", () => {
  it("acepta una base cuyo nombre termina en _test", () => {
    expect(() => assertTestDb("postgresql://u:p@localhost:5432/gestion_socios_test")).not.toThrow();
    expect(() => assertTestDb("postgresql://u:p@localhost:5432/gestion_socios_test?schema=public")).not.toThrow();
  });

  it("rechaza la base de desarrollo", () => {
    expect(() => assertTestDb("postgresql://u:p@localhost:5432/gestion_socios")).toThrow(/_test/);
  });

  it("rechaza una URL de Neon", () => {
    expect(() =>
      assertTestDb("postgresql://u:p@ep-x-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require"),
    ).toThrow(/_test/);
  });

  it("rechaza un nombre que solo contiene _test en el medio", () => {
    expect(() => assertTestDb("postgresql://u:p@localhost:5432/gestion_test_socios")).toThrow(/_test/);
  });

  it("rechaza URL vacía, ausente o inválida", () => {
    expect(() => assertTestDb(undefined)).toThrow(/_test/);
    expect(() => assertTestDb("")).toThrow(/_test/);
    expect(() => assertTestDb("no-es-una-url")).toThrow(/_test/);
  });
});

describe("assertTestEnv (ambas URLs de la base de test)", () => {
  const test = "postgresql://u:p@localhost:5432/gestion_socios_test";

  it("acepta cuando DATABASE_URL y DIRECT_URL son bases *_test", () => {
    expect(() => assertTestEnv({ DATABASE_URL: test, DIRECT_URL: test })).not.toThrow();
  });

  it("rechaza un DIRECT_URL que apunta a otra base aunque DATABASE_URL sea de test", () => {
    expect(() =>
      assertTestEnv({ DATABASE_URL: test, DIRECT_URL: "postgresql://u:p@localhost:5432/gestion_socios" }),
    ).toThrow(/DIRECT_URL/);
  });

  it("rechaza un DATABASE_URL que no es de test", () => {
    expect(() =>
      assertTestEnv({ DATABASE_URL: "postgresql://u:p@localhost:5432/gestion_socios", DIRECT_URL: test }),
    ).toThrow(/DATABASE_URL/);
  });
});
