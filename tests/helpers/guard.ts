// Los tests de integración truncan tablas: solo pueden correr contra una base *_test.

/** Lanza si la URL no apunta a una base cuyo nombre termine en "_test". */
export function assertTestDb(url: string | undefined): void {
  let nombre = "";
  try {
    nombre = url ? new URL(url).pathname.replace(/^\//, "") : "";
  } catch {
    nombre = "";
  }
  if (!nombre.endsWith("_test")) {
    throw new Error(
      `Tests de integración: DATABASE_URL debe apuntar a una base *_test (recibido: "${nombre || "ninguna"}"). Revisá .env.test.`,
    );
  }
}
