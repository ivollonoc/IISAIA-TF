import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { autorizarDemo, autorizarLink, enviarInvitacion, solicitarLink } from "@/modules/acceso/service";
import { consumirToken, crearToken } from "@/modules/acceso/tokens";
import { crearClub } from "@/modules/clubs/service";
import { actualizarSocio, crearSocio } from "@/modules/socios/service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const ahora = new Date(Date.UTC(2026, 9, 15, 15));
const minutos = (n: number) => new Date(ahora.getTime() + n * 60_000);

beforeEach(resetDb);

describe("tokens", () => {
  it("guarda solo el hash y el token sirve una sola vez", async () => {
    const u = await f.crearUsuario();
    const token = await crearToken(u.id, "LOGIN", ahora);
    const guardado = await db.tokenAcceso.findFirstOrThrow();
    expect(guardado.hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(guardado.hash).not.toContain(token);
    expect((await consumirToken(token, minutos(5))).id).toBe(u.id);
    await expect(consumirToken(token, minutos(6))).rejects.toThrow("El link no es válido o ya venció");
  });

  it("el de login vence a los 15 minutos y el de invitación a los 7 días", async () => {
    const u = await f.crearUsuario();
    const login = await crearToken(u.id, "LOGIN", ahora);
    await expect(consumirToken(login, minutos(16))).rejects.toThrow("El link no es válido o ya venció");
    const invitacion = await crearToken(u.id, "INVITACION", ahora);
    await expect(consumirToken(invitacion, minutos(7 * 24 * 60 - 1))).resolves.toBeTruthy();
  });

  it("un token inventado no sirve", async () => {
    await expect(consumirToken("cualquiera", ahora)).rejects.toThrow("El link no es válido o ya venció");
  });
});

describe("link mágico", () => {
  it("a un email registrado le manda un link por mail que sirve para entrar", async () => {
    const u = await f.crearUsuario({ email: "ana@club.com" });
    const { link } = await solicitarLink(" ANA@club.com ", ahora);
    expect(link).toMatch(/\/ingresar\/[\w-]+$/);
    const [mail] = await db.mensajeSaliente.findMany();
    expect(mail).toMatchObject({ canal: "EMAIL", destino: "ana@club.com", asunto: "Tu link para entrar" });
    expect(mail.cuerpo).toContain(link!);
    const token = link!.split("/ingresar/")[1];
    expect((await autorizarLink(token))?.id).toBe(u.id);
    expect(await autorizarLink(token)).toBeNull();
  });

  it("desde la página de un club solo manda el link a usuarios de ese club", async () => {
    const [norte, sur] = [await f.crearClub(), await f.crearClub()];
    await f.crearUsuario({ email: "ana@norte.com", clubId: norte.id });
    expect(await solicitarLink("ana@norte.com", ahora, sur.id)).toEqual({ link: null });
    expect(await db.mensajeSaliente.count()).toBe(0);
    expect((await solicitarLink("ana@norte.com", ahora, norte.id)).link).not.toBeNull();
  });

  it("a un email no registrado no le manda nada (y la respuesta no lo distingue salvo el link de demo)", async () => {
    expect(await solicitarLink("nadie@club.com", ahora)).toEqual({ link: null });
    expect(await db.mensajeSaliente.count()).toBe(0);
  });
});

describe("invitaciones", () => {
  it("crear un club invita a su admin", async () => {
    await crearClub({ nombre: "Club Norte", slug: "norte", adminEmail: "admin@norte.com" });
    const [mail] = await db.mensajeSaliente.findMany();
    expect(mail).toMatchObject({ destino: "admin@norte.com", asunto: "Te invitaron a administrar Club Norte" });
    expect(await db.tokenAcceso.count({ where: { tipo: "INVITACION" } })).toBe(1);
  });

  it("crear un socio con email lo invita; sin email, no; cambiarle el email lo vuelve a invitar", async () => {
    const club = await f.crearClub({ nombre: "Club Sur" });
    const tipo = await f.crearTipo(club.id);
    const base = { nombre: "Ana", apellido: "Paz", dni: "30111222", tipoSocioId: tipo.id };
    const s = await crearSocio(club.id, { ...base, email: "ana@sur.com" });
    await crearSocio(club.id, { ...base, dni: "30111223", email: "" });
    expect((await db.mensajeSaliente.findMany()).map((m) => [m.destino, m.asunto])).toEqual([["ana@sur.com", "Te invitaron a Club Sur"]]);

    await actualizarSocio(club.id, s.id, { ...base, email: "ana.paz@sur.com" });
    expect(await db.mensajeSaliente.count({ where: { destino: "ana.paz@sur.com" } })).toBe(1);
    await actualizarSocio(club.id, s.id, { ...base, nombre: "Ana María", email: "ana.paz@sur.com" });
    expect(await db.mensajeSaliente.count()).toBe(2);
  });

  it("enviarInvitacion devuelve el link y lo manda por mail", async () => {
    const club = await f.crearClub({ nombre: "Club Este" });
    const u = await f.crearUsuario({ email: "beto@este.com", rol: "SOCIO", clubId: club.id });
    const link = await enviarInvitacion(u.id, ahora);
    expect(link).toMatch(/\/ingresar\/[\w-]+$/);
    expect((await db.mensajeSaliente.findFirstOrThrow()).cuerpo).toContain(link);
  });
});

describe("links por mail con subdominios", () => {
  it("los de un usuario de club van a su subdominio; los del admin general, al dominio raíz", async () => {
    vi.stubEnv("TENANT_MODE", "subdomain");
    vi.stubEnv("ROOT_DOMAIN", "clubdesocios.com.ar");
    vi.stubEnv("APP_URL", "https://clubdesocios.com.ar");
    try {
      const club = await f.crearClub({ slug: "norte" });
      await f.crearUsuario({ email: "ana@norte.com", clubId: club.id });
      const socio = await f.crearUsuario({ email: "beto@norte.com", rol: "SOCIO", clubId: club.id });
      await f.crearUsuario({ email: "jefe@plataforma.com", rol: "SUPERADMIN" });
      expect((await solicitarLink("ana@norte.com", ahora)).link).toMatch(/^https:\/\/norte\.clubdesocios\.com\.ar\/ingresar\/[\w-]+$/);
      expect(await enviarInvitacion(socio.id, ahora)).toMatch(/^https:\/\/norte\.clubdesocios\.com\.ar\/ingresar\/[\w-]+$/);
      expect((await solicitarLink("jefe@plataforma.com", ahora)).link).toMatch(/^https:\/\/clubdesocios\.com\.ar\/ingresar\/[\w-]+$/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("autorizarDemo", () => {
  it("solo deja entrar sin link a los usuarios marcados como demo", async () => {
    const demo = await f.crearUsuario({ email: "demo@club.com" });
    await db.usuario.update({ where: { id: demo.id }, data: { demo: true } });
    await f.crearUsuario({ email: "real@club.com" });
    expect((await autorizarDemo("DEMO@club.com"))?.id).toBe(demo.id);
    expect(await autorizarDemo("real@club.com")).toBeNull();
    expect(await autorizarDemo("nadie@club.com")).toBeNull();
  });
});
