import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import * as canales from "@/modules/notificaciones/canales";
import { notificar, notificarAdmins } from "@/modules/notificaciones/emitir";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const aviso = { tipo: "AVISO_CLUB" as const, asunto: "Corte de agua", mensaje: "El sábado no hay agua caliente", actividadId: null };

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

describe("notificar", () => {
  it("crea un aviso in-app por cada socio activo del club con usuario (no inactivos, no otro club)", async () => {
    const club = await f.crearClub();
    const { usuario: u1 } = await f.crearSocioConUsuario(club.id);
    const { usuario: u2 } = await f.crearSocioConUsuario(club.id);
    await f.crearSocioConUsuario(club.id, { activo: false });
    await f.crearSocio(club.id); // sin usuario: no tiene bandeja
    await f.crearSocioConUsuario((await f.crearClub()).id);

    await notificar(club.id, aviso);

    const notis = await db.notificacion.findMany({ orderBy: { usuarioId: "asc" } });
    expect(notis.map((n) => n.usuarioId).sort()).toEqual([u1.id, u2.id].sort());
    expect(notis[0]).toMatchObject({ clubId: club.id, tipo: "AVISO_CLUB", titulo: "Corte de agua", cuerpo: "El sábado no hay agua caliente", leidaAt: null });
    expect(await db.mensajeSaliente.count()).toBe(0);
  });

  it("con mail y SMS activos deja los mensajes en el buzón de salida (simulado)", async () => {
    const club = await f.crearClub({ canales: ["IN_APP", "EMAIL", "SMS"] });
    const { usuario } = await f.crearSocioConUsuario(club.id, { telefono: "+54 11 5555-0001" });
    await f.crearSocio(club.id, { email: "sinusuario@test.com" });

    await notificar(club.id, aviso);

    const salientes = await db.mensajeSaliente.findMany({ orderBy: [{ canal: "asc" }, { destino: "asc" }] });
    expect(salientes.map((m) => [m.canal, m.destino, m.proveedor])).toEqual([
      ["EMAIL", "sinusuario@test.com", "simulado"],
      ["EMAIL", usuario.email, "simulado"],
      ["SMS", "+54 11 5555-0001", "simulado"],
    ]);
    expect(salientes[0]).toMatchObject({ clubId: club.id, asunto: "Corte de agua" });
    expect(await db.notificacion.count()).toBe(1);
  });

  it("un canal que falla no impide los demás ni rompe la operación", async () => {
    const club = await f.crearClub({ canales: ["IN_APP", "EMAIL"] });
    await f.crearSocioConUsuario(club.id);
    vi.spyOn(canales.proveedores, "email").mockRejectedValue(new Error("Resend caído"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(notificar(club.id, aviso)).resolves.toBeUndefined();
    expect(await db.notificacion.count()).toBe(1);
  });

  it("un aviso para una actividad llega solo a sus inscriptos", async () => {
    const club = await f.crearClub();
    const act = await f.crearActividad(club.id);
    const { socio, usuario } = await f.crearSocioConUsuario(club.id);
    await f.crearSocioConUsuario(club.id);
    await f.reservarDirecto(club.id, act.id, socio.id);

    await notificar(club.id, { ...aviso, actividadId: act.id });

    expect((await db.notificacion.findMany()).map((n) => n.usuarioId)).toEqual([usuario.id]);
  });
});

describe("notificarAdmins", () => {
  it("avisa a los admins de todos los clubes o de uno, por in-app y mail", async () => {
    const [c1, c2] = [await f.crearClub(), await f.crearClub()];
    const a1 = await f.crearUsuario({ rol: "ADMIN_CLUB", clubId: c1.id });
    const a2 = await f.crearUsuario({ rol: "ADMIN_CLUB", clubId: c2.id });
    await f.crearSocioConUsuario(c1.id);

    await notificarAdmins({ asunto: "Mantenimiento", mensaje: "El domingo de 2 a 4", clubId: null });
    expect((await db.notificacion.findMany()).map((n) => n.usuarioId).sort()).toEqual([a1.id, a2.id].sort());
    expect((await db.mensajeSaliente.findMany()).map((m) => m.destino).sort()).toEqual([a1.email, a2.email].sort());

    await notificarAdmins({ asunto: "Solo C2", mensaje: "Hola", clubId: c2.id });
    expect(await db.notificacion.count({ where: { titulo: "Solo C2" } })).toBe(1);
  });
});
