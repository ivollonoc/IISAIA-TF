import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const backfill = readFileSync("prisma/migrations/20261012180200_actividad_creada_backfill/migration.sql", "utf8");

beforeEach(resetDb);

describe("backfill de Actividad.createdAt", () => {
  it("las actividades anteriores a la migración toman la fecha de creación de su club", async () => {
    const club = await f.crearClub();
    const viejaFecha = new Date(Date.UTC(2025, 2, 1));
    await db.club.update({ where: { id: club.id }, data: { createdAt: viejaFecha } });
    const actividad = await f.crearActividad(club.id);
    await db.$executeRawUnsafe(backfill);
    expect((await db.actividad.findUniqueOrThrow({ where: { id: actividad.id } })).createdAt).toEqual(viejaFecha);
  });
});
