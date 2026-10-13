import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { actualizarCanales } from "@/modules/clubs/service";
import {
  contarNoLeidas,
  enviarAvisoClub,
  enviarAvisoPlataforma,
  historialAvisos,
  listarNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
  ultimasNoLeidas,
} from "@/modules/notificaciones/service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

beforeEach(resetDb);

const noti = (usuarioId: string, over: { titulo?: string; link?: string | null; leidaAt?: Date | null; createdAt?: Date } = {}) =>
  db.notificacion.create({ data: { usuarioId, tipo: "AVISO_CLUB", titulo: "Aviso", cuerpo: "Texto", link: "/c/demo/socio", ...over } });

describe("bandeja", () => {
  it("lista las del usuario, más recientes primero, y cuenta las no leídas", async () => {
    const u = await f.crearUsuario();
    const otro = await f.crearUsuario();
    await noti(u.id, { titulo: "Vieja", createdAt: new Date(2026, 9, 1), leidaAt: new Date() });
    await noti(u.id, { titulo: "Nueva", createdAt: new Date(2026, 9, 10) });
    await noti(otro.id);

    expect((await listarNotificaciones(u.id)).map((n) => n.titulo)).toEqual(["Nueva", "Vieja"]);
    expect(await contarNoLeidas(u.id)).toBe(1);
    expect((await ultimasNoLeidas(u.id)).map((n) => n.titulo)).toEqual(["Nueva"]);
  });

  it("marcar leída solo afecta las propias y devuelve el link interno", async () => {
    const u = await f.crearUsuario();
    const otro = await f.crearUsuario();
    const n = await noti(u.id);
    const ajena = await noti(otro.id);

    expect(await marcarLeida(u.id, n.id)).toBe("/c/demo/socio");
    expect((await db.notificacion.findUniqueOrThrow({ where: { id: n.id } })).leidaAt).not.toBeNull();
    expect(await marcarLeida(u.id, ajena.id)).toBeNull();
    expect((await db.notificacion.findUniqueOrThrow({ where: { id: ajena.id } })).leidaAt).toBeNull();
  });

  it("un link externo o con // no se devuelve (no redirige afuera)", async () => {
    const u = await f.crearUsuario();
    for (const link of ["https://malo.com", "//malo.com", "javascript:alert(1)"]) {
      const n = await noti(u.id, { link });
      expect(await marcarLeida(u.id, n.id)).toBeNull();
    }
  });

  it("marcar todas deja la bandeja sin no leídas", async () => {
    const u = await f.crearUsuario();
    await noti(u.id);
    await noti(u.id);
    await marcarTodasLeidas(u.id);
    expect(await contarNoLeidas(u.id)).toBe(0);
  });
});

describe("avisos manuales", () => {
  it("el admin de club avisa a todos o a los inscriptos de una actividad", async () => {
    const club = await f.crearClub();
    const act = await f.crearActividad(club.id);
    const { socio, usuario: inscripto } = await f.crearSocioConUsuario(club.id);
    const { usuario: otro } = await f.crearSocioConUsuario(club.id);
    await f.inscribirDirecto(club.id, act.id, socio.id);

    expect(await enviarAvisoClub(club.id, { asunto: "Pileta cerrada", mensaje: "Por mantenimiento", actividadId: act.id })).toEqual({
      destinatarios: 1,
    });
    await enviarAvisoClub(club.id, { asunto: "Asamblea", mensaje: "El jueves a las 20", actividadId: "" });

    expect(await contarNoLeidas(inscripto.id)).toBe(2);
    expect(await contarNoLeidas(otro.id)).toBe(1);
  });

  it("valida asunto y mensaje y rechaza una actividad de otro club", async () => {
    const club = await f.crearClub();
    await expect(enviarAvisoClub(club.id, { asunto: "", mensaje: "Hola a todos" })).rejects.toBeInstanceOf(ZodError);
    const ajena = await f.crearActividad((await f.crearClub()).id);
    await expect(enviarAvisoClub(club.id, { asunto: "Hola", mensaje: "Texto", actividadId: ajena.id })).rejects.toThrow(
      "Actividad no encontrada",
    );
  });

  it("el admin general avisa a los admins de todos los clubes o de uno", async () => {
    const [c1, c2] = [await f.crearClub(), await f.crearClub()];
    const a1 = await f.crearUsuario({ rol: "ADMIN_CLUB", clubId: c1.id });
    const a2 = await f.crearUsuario({ rol: "ADMIN_CLUB", clubId: c2.id });
    await enviarAvisoPlataforma({ asunto: "Novedades", mensaje: "Hay reportes nuevos", clubId: "" });
    await enviarAvisoPlataforma({ asunto: "Solo C1", mensaje: "Hola", clubId: c1.id });
    expect(await contarNoLeidas(a1.id)).toBe(2);
    expect(await contarNoLeidas(a2.id)).toBe(1);
  });
});

describe("canales y buzón", () => {
  it("actualizarCanales guarda mail y SMS; in-app queda siempre", async () => {
    const club = await f.crearClub();
    await actualizarCanales(club.id, { EMAIL: "on", SMS: "on" });
    expect((await db.club.findUniqueOrThrow({ where: { id: club.id } })).canales).toEqual(["IN_APP", "EMAIL", "SMS"]);
    await actualizarCanales(club.id, {});
    expect((await db.club.findUniqueOrThrow({ where: { id: club.id } })).canales).toEqual(["IN_APP"]);
  });

  it("el historial guarda los avisos manuales de cada club por separado, sin los individuales", async () => {
    const [c1, c2] = [await f.crearClub({ canales: ["IN_APP", "EMAIL"] }), await f.crearClub()];
    const act = await f.crearActividad(c1.id, { nombre: "Yoga" });
    const admin = await f.crearUsuario({ rol: "ADMIN_CLUB", clubId: c1.id });
    await f.crearSocioConUsuario(c1.id);
    await enviarAvisoClub(c1.id, { asunto: "General", mensaje: "Para todos" }, admin.id);
    await enviarAvisoClub(c1.id, { asunto: "Yoga", mensaje: "Solo Yoga", actividadId: act.id }, admin.id);
    await enviarAvisoClub(c2.id, { asunto: "Otro club", mensaje: "Hola a todos" });

    const h = await historialAvisos("CLUB", c1.id);
    expect(h.map((a) => [a.asunto, a.para, a.destinatarios, a.canales])).toEqual([
      ["Yoga", "Inscriptos de Yoga", 0, ["IN_APP", "EMAIL"]],
      ["General", "Todos los socios", 1, ["IN_APP", "EMAIL"]],
    ]);
    expect(h[0].autorId).toBe(admin.id);
  });

  it("el historial de la plataforma guarda sus avisos y no los de los clubes", async () => {
    const club = await f.crearClub({ nombre: "Club Atlas" });
    await f.crearUsuario({ rol: "ADMIN_CLUB", clubId: club.id });
    await enviarAvisoPlataforma({ asunto: "A todos", mensaje: "Hola a todos", clubId: "" });
    await enviarAvisoPlataforma({ asunto: "A Atlas", mensaje: "Hola a todos", clubId: club.id });
    await enviarAvisoClub(club.id, { asunto: "Del club", mensaje: "Hola a todos" });
    expect((await historialAvisos("PLATAFORMA")).map((a) => [a.asunto, a.para, a.destinatarios])).toEqual([
      ["A Atlas", "Club Atlas", 1],
      ["A todos", "Todos los clubes", 1],
    ]);
  });
});
