// Los tests de integración truncan tablas: solo pueden correr contra una base *_test.

/** Lanza si la URL no apunta a una base cuyo nombre termine en "_test". */
export function assertTestDb(url: string | undefined, variable = "DATABASE_URL"): void {
  let nombre = "";
  try {
    nombre = url ? new URL(url).pathname.replace(/^\//, "") : "";
  } catch {
    nombre = "";
  }
  if (!nombre.endsWith("_test")) {
    throw new Error(
      `Tests de integración: ${variable} debe apuntar a una base *_test (recibido: "${nombre || "ninguna"}"). Revisá .env.test.`,
    );
  }
}

/** Chequea las dos URLs: DATABASE_URL (consultas y DROP SCHEMA) y DIRECT_URL (la usa `migrate deploy`). */
export function assertTestEnv(env: { DATABASE_URL: string | undefined; DIRECT_URL: string | undefined }): void {
  assertTestDb(env.DATABASE_URL, "DATABASE_URL");
  assertTestDb(env.DIRECT_URL, "DIRECT_URL");
}
