import { db } from "@/lib/db";

/** Vacía todas las tablas de negocio (no la de migraciones). Se llama en beforeEach. */
export async function resetDb(): Promise<void> {
  const tablas = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tablas.length === 0) return;
  const lista = tablas.map((t) => `"public"."${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}
