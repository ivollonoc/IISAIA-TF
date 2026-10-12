// Variables de la base de test. Salen SIEMPRE de .env.test (el archivo gana sobre el entorno):
// un DATABASE_URL exportado en la shell o en CI no puede redirigir los tests a otra base.
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

export function testDbEnv(): { DATABASE_URL: string; DIRECT_URL: string } {
  const vars = parseEnv(readFileSync(path.resolve(process.cwd(), ".env.test"), "utf8"));
  const url = vars.DATABASE_URL ?? "";
  return { DATABASE_URL: url, DIRECT_URL: vars.DIRECT_URL ?? url };
}
