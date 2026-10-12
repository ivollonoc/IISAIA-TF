// Corre antes de cada archivo de integración: re-chequea la base y cierra la conexión al final.
import { afterAll } from "vitest";
import { db } from "@/lib/db";
import { assertTestDb } from "./guard";

assertTestDb(process.env.DATABASE_URL);

afterAll(async () => {
  await db.$disconnect();
});
