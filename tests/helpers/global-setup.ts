import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { testDbEnv } from "./env";
import { assertTestEnv } from "./guard";

/**
 * Una vez por corrida: crea la base de test si no existe, la vacía y aplica todas las
 * migraciones desde cero (así también se valida que migran sobre una base nueva).
 * Usa `migrate deploy` y no `migrate reset`: no es destructivo para Prisma y no requiere confirmación.
 */
export default async function setup() {
  const env = testDbEnv();
  assertTestEnv(env);
  const url = new URL(env.DATABASE_URL);
  const nombre = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    const existe = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${nombre}`;
    if (existe.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${nombre}"`);
  } catch (e) {
    throw new Error(
      `No se pudo conectar a Postgres en ${url.host}. ¿Está levantado? (docker compose up -d db)\n${String(e)}`,
    );
  } finally {
    await admin.$disconnect();
  }

  const test = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  try {
    await test.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await test.$executeRawUnsafe("CREATE SCHEMA public");
  } finally {
    await test.$disconnect();
  }

  try {
    execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, ...env } });
  } catch (e) {
    const salida = (e as { stderr?: Buffer }).stderr?.toString() ?? String(e);
    throw new Error(`Falló prisma migrate deploy sobre ${nombre}:\n${salida}`);
  }
}
