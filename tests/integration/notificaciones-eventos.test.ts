import { beforeEach, describe, expect, it } from "vitest";
import type { Club } from "@prisma/client";
import { db } from "@/lib/db";
import { crearActividad, editarActividad } from "@/modules/actividades/service";
import { cancelarInscripcionEvento, crearEvento, eliminarEvento } from "@/modules/calendario/eventos.service";
import { reprogramarClase, restablecerClase, suspenderClase } from "@/modules/calendario/service";
import { generarCargosPeriodo } from "@/modules/cuenta-corriente/cargos.service";
import { registrarPago } from "@/modules/cuenta-corriente/pagos.service";
import { pagarOnline } from "@/modules/pagos-online/checkout.service";
import { pasarelaSimulada } from "@/modules/pagos-online/simulada";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const hoy = new Date(Date.UTC(2026, 9, 15, 15)); // jueves 15/10/2026

let club: Club;
beforeEach(async () => {
  await resetDb();
  club = await f.crearClub({ diaVencimiento: 20 });
});

const titulos = async (usuarioId?: string) =>
  (await db.notificacion.findMany({ where: usuarioId ? { usuarioId } : {}, orderBy: { createdAt: "asc" } })).map((n) => n.titulo);

describe("pagos", () => {
  it("un pago en ventanilla avisa al socio", async () => {
    const { socio, usuario } = await f.crearSocioConUsuario(club.id);
    const cargo = await f.crearCargo(club.id, socio.id, { monto: 15000 });
    await registrarPago(club.id, { socioId: socio.id, cargoIds: [cargo.id], medio: "EFECTIVO" });
    const [n] = await db.notificacion.findMany({ where: { usuarioId: usuario.id } });
    expect(n).toMatchObject({ tipo: "PAGO_ACREDITADO", titulo: "Pago acreditado" });
    expect(n.cuerpo).toContain("15.000");
  });

  it("un pago online aprobado avisa una vez; uno rechazado no avisa", async () => {
    const { socio, usuario } = await f.crearSocioConUsuario(club.id);
    const c1 = await f.crearCargo(club.id, socio.id);
    const c2 = await f.crearCargo(club.id, socio.id);
    const tarjeta = (numero: string) => ({ numero, vencimiento: "12/30", cvv: "123", titular: "Ana Paz" });
    await pagarOnline(club.id, socio.id, [c1.id], tarjeta("4000000000000002"), pasarelaSimulada);
    expect(await titulos(usuario.id)).toEqual([]);
    await pagarOnline(club.id, socio.id, [c2.id], tarjeta("4000000000000001"), pasarelaSimulada);
    expect(await titulos(usuario.id)).toEqual(["Pago acreditado"]);
  });
});

describe("generación de cargos", () => {
  it("avisa a cada socio con cargos nuevos, con su total y vencimiento; generar de nuevo no avisa", async () => {
    const tipo = await f.crearTipo(club.id, { cuotaMensual: 15000 });
    const { usuario } = await f.crearSocioConUsuario(club.id, { tipoSocioId: tipo.id });
    await generarCargosPeriodo(club.id, { periodo: "2026-10" }, hoy);
    const [n] = await db.notificacion.findMany({ where: { usuarioId: usuario.id } });
    expect(n.titulo).toBe("Ya podés pagar 2026-10");
    expect(n.cuerpo).toContain("15.000");
    expect(n.cuerpo).toContain("20/10/2026");

    await generarCargosPeriodo(club.id, { periodo: "2026-10" }, hoy);
    expect(await db.notificacion.count()).toBe(1);
  });
});

describe("clases", () => {
  it("suspender, reprogramar y restablecer avisan solo a quienes reservaron esa clase", async () => {
    const act = await f.crearActividad(club.id, { nombre: "Natación", horarios: [{ diaSemana: 3, hora: "19:00" }] });
    const { socio, usuario } = await f.crearSocioConUsuario(club.id);
    const { usuario: otro } = await f.crearSocioConUsuario(club.id);
    await f.reservarDirecto(club.id, act.id, socio.id, { fecha: dia(2026, 10, 21), hora: "19:00" });
    await f.reservarDirecto(club.id, act.id, socio.id, { fecha: dia(2026, 10, 28), hora: "19:00" });
    await f.reservarDirecto(club.id, act.id, (await f.crearSocio(club.id)).id, { fecha: dia(2026, 11, 4), hora: "19:00" });

    const e = await suspenderClase(club.id, { actividadId: act.id, fecha: "2026-10-21", hora: "19:00", motivo: "Feriado" }, hoy);
    await restablecerClase(club.id, e.id, hoy);
    await reprogramarClase(
      club.id,
      { actividadId: act.id, fecha: "2026-10-28", hora: "19:00", nuevaFecha: "2026-10-29", nuevaHora: "20:00", motivo: "Lluvia" },
      hoy,
    );

    expect(await titulos(usuario.id)).toEqual(["Clase suspendida: Natación", "Clase confirmada: Natación", "Clase reprogramada: Natación"]);
    expect(await titulos(otro.id)).toEqual([]);
    const reprog = await db.notificacion.findFirstOrThrow({ where: { tipo: "CLASE_REPROGRAMADA" } });
    expect(reprog.cuerpo).toBe("La clase del Mié 28/10 19:00 pasa al Jue 29/10 20:00. Motivo: Lluvia.");
  });
});

describe("actividades", () => {
  const form = { nombre: "Funcional", cupo: "10", fechaInicio: "2026-10-01", h_0_dia: "1", h_0_hora: "19:00" };

  it("una actividad nueva avisa a todos los socios", async () => {
    const { usuario } = await f.crearSocioConUsuario(club.id);
    await crearActividad(club.id, form);
    expect(await titulos(usuario.id)).toEqual(["Nueva actividad: Funcional"]);
  });

  it("cambiar horarios o fechas avisa a quienes participan; cambiar solo el nombre no", async () => {
    const act = await f.crearActividad(club.id, { nombre: "Funcional", horarios: [{ diaSemana: 1, hora: "19:00" }], fechaInicio: dia(2026, 10, 1) });
    const { socio, usuario } = await f.crearSocioConUsuario(club.id);
    await f.reservarDirecto(club.id, act.id, socio.id, { fecha: dia(2026, 10, 19), hora: "19:00" });

    await editarActividad(club.id, act.id, { ...form, nombre: "Funcional adultos" }, hoy);
    expect(await titulos(usuario.id)).toEqual([]);
    await editarActividad(club.id, act.id, { ...form, h_0_hora: "20:00" }, hoy);
    expect(await titulos(usuario.id)).toEqual(["Cambió el horario de Funcional"]);
  });

  it("subir el cupo avisa a la lista de espera de las clases que estaban llenas", async () => {
    const act = await f.crearActividad(club.id, { nombre: "Yoga", cupo: 1, fechaInicio: dia(2026, 10, 1) });
    const clase = { fecha: dia(2026, 10, 19), hora: "18:00" };
    await f.reservarDirecto(club.id, act.id, (await f.crearSocio(club.id)).id, clase);
    const { socio, usuario } = await f.crearSocioConUsuario(club.id);
    await f.anotarEsperaDirecto(club.id, socio.id, { actividadId: act.id, ...clase });

    await editarActividad(club.id, act.id, { ...form, nombre: "Yoga", cupo: "2", h_0_hora: "18:00" }, hoy);
    expect(await titulos(usuario.id)).toEqual(["Se liberó un lugar en Yoga"]);
  });
});

describe("eventos", () => {
  it("un evento nuevo avisa a todo el club o a quienes participan de su actividad; eliminarlo avisa a la misma audiencia", async () => {
    const act = await f.crearActividad(club.id);
    const { socio, usuario: inscripto } = await f.crearSocioConUsuario(club.id);
    const { usuario: otro } = await f.crearSocioConUsuario(club.id);
    await f.reservarDirecto(club.id, act.id, socio.id);

    await crearEvento(club.id, { titulo: "Asamblea", fecha: "2026-10-20", hora: "20:00", lugar: "Sede" }, hoy);
    const clinica = await crearEvento(club.id, { titulo: "Clínica", fecha: "2026-10-20", hora: "10:00", actividadId: act.id }, hoy);
    await eliminarEvento(club.id, clinica.id);

    expect(await titulos(inscripto.id)).toEqual(["Nuevo evento: Asamblea", "Nuevo evento: Clínica", "Evento cancelado: Clínica"]);
    expect(await titulos(otro.id)).toEqual(["Nuevo evento: Asamblea"]);
  });

  it("cancelar la inscripción a un evento lleno avisa a su lista de espera", async () => {
    const ev = await f.crearEvento(club.id, { titulo: "Cena", conInscripcion: true, cupo: 1, fecha: dia(2026, 10, 24) });
    const a = await f.crearSocio(club.id);
    await f.inscribirEventoDirecto(club.id, ev.id, a.id);
    const { socio, usuario } = await f.crearSocioConUsuario(club.id);
    await f.anotarEsperaDirecto(club.id, socio.id, { eventoId: ev.id });

    await cancelarInscripcionEvento(club.id, ev.id, a.id, hoy);
    expect(await titulos(usuario.id)).toEqual(["Se liberó un lugar en Cena"]);
  });
});
