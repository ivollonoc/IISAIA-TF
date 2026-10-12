import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { crearClub, listarClubs } from "@/server/clubs";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

beforeEach(resetDb);

const input = (over: Record<string, string> = {}) => ({
  nombre: "Club Norte",
  slug: "club-norte",
  adminEmail: "admin@norte.com",
  ...over,
});

describe("crearClub", () => {
  it("crea el club y su usuario ADMIN_CLUB", async () => {
    const club = await crearClub(input());
    expect(club).toMatchObject({ nombre: "Club Norte", slug: "club-norte" });
    const admin = await db.usuario.findUnique({ where: { email: "admin@norte.com" } });
    expect(admin).toMatchObject({ rol: "ADMIN_CLUB", clubId: club.id });
  });

  it("rechaza un slug repetido", async () => {
    await crearClub(input());
    await expect(crearClub(input({ adminEmail: "otro@norte.com" }))).rejects.toMatchObject({ code: "P2002" });
  });

  it("rechaza un email que usa un socio o el superadmin", async () => {
    await db.usuario.create({ data: { email: "admin@norte.com", rol: "SOCIO" } });
    await expect(crearClub(input())).rejects.toThrow("Ese email ya está en uso por otro tipo de usuario");
    expect(await db.club.count()).toBe(0);
  });

  it("rechaza un email que ya administra otro club", async () => {
    await crearClub(input());
    await expect(crearClub(input({ slug: "club-sur" }))).rejects.toThrow("Ese email ya administra otro club");
    expect(await db.club.count()).toBe(1);
  });

  it("reasigna al club nuevo un ADMIN_CLUB que no tenía club", async () => {
    await db.usuario.create({ data: { email: "admin@norte.com", rol: "ADMIN_CLUB" } });
    const club = await crearClub(input());
    const admin = await db.usuario.findUnique({ where: { email: "admin@norte.com" } });
    expect(admin?.clubId).toBe(club.id);
    expect(await db.usuario.count()).toBe(1);
  });

  it("rechaza datos inválidos", async () => {
    await expect(crearClub(input({ slug: "club norte" }))).rejects.toBeInstanceOf(ZodError);
  });
});

describe("listarClubs", () => {
  it("incluye los emails de sus admins y la cantidad de socios", async () => {
    const club = await crearClub(input());
    await f.crearSocio(club.id);
    const [c] = await listarClubs();
    expect(c.usuarios.map((u) => u.email)).toEqual(["admin@norte.com"]);
    expect(c._count.socios).toBe(1);
  });
});
