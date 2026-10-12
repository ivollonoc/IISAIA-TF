import { describe, expect, it } from "vitest";
import { assertTestDb } from "../helpers/guard";

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
