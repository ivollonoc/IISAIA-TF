import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { actualizarCanales } from "@/modules/clubs/service";
import {
  buzonSalida,
  contarNoLeidas,
  enviarAvisoClub,
  enviarAvisoPlataforma,
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
    await expect(enviarAvisoClub(club.id, { asunto: "", mensaje: "x" })).rejects.toBeInstanceOf(ZodError);
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

  it("el buzón de salida de un club no muestra los de otro; el global muestra todos", async () => {
    const [c1, c2] = [await f.crearClub(), await f.crearClub()];
    await db.mensajeSaliente.create({ data: { clubId: c1.id, canal: "EMAIL", destino: "a@x.com", cuerpo: "1", proveedor: "simulado" } });
    await db.mensajeSaliente.create({ data: { clubId: c2.id, canal: "SMS", destino: "+54", cuerpo: "2", proveedor: "simulado" } });
    expect((await buzonSalida(c1.id)).map((m) => m.destino)).toEqual(["a@x.com"]);
    expect(await buzonSalida(null)).toHaveLength(2);
  });
});
