import { beforeEach, describe, expect, it } from "vitest";
import type { Club, Socio, TipoSocio } from "@prisma/client";
import { db } from "@/lib/db";
import { cancelarInscripcion, inscribir } from "@/modules/actividades/service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const hoy = new Date(2026, 9, 15, 12); // período 2026-10
const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

let club: Club;
let tipo: TipoSocio;
let socio: Socio;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub({ diaVencimiento: 10 });
  tipo = await f.crearTipo(club.id, { cuotaMensual: 15000 });
  socio = await f.crearSocio(club.id, { tipoSocioId: tipo.id });
});

/** Simula que el admin ya generó los cargos del período: existe al menos un cargo del club en 2026-10. */
const periodoGenerado = async () => {
  const otro = await f.crearSocio(club.id, { tipoSocioId: tipo.id });
  await f.crearCargo(club.id, otro.id, { periodo: "2026-10", clave: "CUOTA" });
};

const cargoDe = (actividadId: string) =>
  db.cargo.findUnique({ where: { socioId_periodo_clave: { socioId: socio.id, periodo: "2026-10", clave: `ACT:${actividadId}` } } });

describe("inscribirse a una actividad paga", () => {
  it("con el período generado crea el cargo del arancel del mes completo", async () => {
    await periodoGenerado();
    const natacion = await f.crearActividad(club.id, { nombre: "Natación", arancel: 5000 });
    const r = await inscribir(club.id, natacion.id, socio.id, hoy);
    expect(r.cargo?.monto).toBe(5000);
    expect(await cargoDe(natacion.id)).toMatchObject({
      concepto: "ACTIVIDAD",
      descripcion: "Natación 2026-10",
      monto: 5000,
      estado: "PENDIENTE",
      vencimiento: utc(2026, 10, 10),
    });
  });

  it("sin el período generado no crea cargo (lo hará la generación)", async () => {
    const natacion = await f.crearActividad(club.id, { arancel: 5000 });
    const r = await inscribir(club.id, natacion.id, socio.id, hoy);
    expect(r.cargo).toBeNull();
    expect(await db.cargo.count()).toBe(0);
  });

  it("una actividad gratuita no genera cargo", async () => {
    await periodoGenerado();
    const yoga = await f.crearActividad(club.id, { arancel: 0 });
    expect((await inscribir(club.id, yoga.id, socio.id, hoy)).cargo).toBeNull();
  });

  it("un socio con cuota $0 también recibe el cargo del arancel", async () => {
    await periodoGenerado();
    const gratis = await f.crearTipo(club.id, { cuotaMensual: 0 });
    const becado = await f.crearSocio(club.id, { tipoSocioId: gratis.id });
    const natacion = await f.crearActividad(club.id, { arancel: 5000 });
    const r = await inscribir(club.id, natacion.id, becado.id, hoy);
    expect(r.cargo?.monto).toBe(5000);
  });

  it("si falla la creación del cargo, no queda la inscripción", async () => {
    await periodoGenerado();
    await db.club.update({ where: { id: club.id }, data: { diaVencimiento: 31 } }); // inválido a propósito
    const natacion = await f.crearActividad(club.id, { arancel: 5000 });
    await expect(inscribir(club.id, natacion.id, socio.id, hoy)).rejects.toThrow("Día de vencimiento inválido");
    expect(await db.inscripcion.count()).toBe(0);
  });
});

describe("cancelar la inscripción", () => {
  it("anula el cargo del mes si está pendiente", async () => {
    await periodoGenerado();
    const natacion = await f.crearActividad(club.id, { arancel: 5000 });
    await inscribir(club.id, natacion.id, socio.id, hoy);
    await cancelarInscripcion(club.id, natacion.id, socio.id, hoy);
    expect(await cargoDe(natacion.id)).toMatchObject({ estado: "ANULADO", motivoAnulacion: "Baja de actividad" });
  });

  it("si el cargo ya estaba pagado, queda pagado (sin reintegro)", async () => {
    await periodoGenerado();
    const natacion = await f.crearActividad(club.id, { arancel: 5000 });
    await inscribir(club.id, natacion.id, socio.id, hoy);
    await db.cargo.updateMany({ where: { socioId: socio.id }, data: { estado: "PAGADO" } });
    await cancelarInscripcion(club.id, natacion.id, socio.id, hoy);
    expect((await cargoDe(natacion.id))?.estado).toBe("PAGADO");
  });

  it("reinscribirse en el mismo mes reactiva el cargo anulado con el arancel vigente", async () => {
    await periodoGenerado();
    const natacion = await f.crearActividad(club.id, { arancel: 5000 });
    await inscribir(club.id, natacion.id, socio.id, hoy);
    const original = await cargoDe(natacion.id);
    await cancelarInscripcion(club.id, natacion.id, socio.id, hoy);
    await db.actividad.update({ where: { id: natacion.id }, data: { arancel: 6000 } });
    await inscribir(club.id, natacion.id, socio.id, hoy);
    expect(await cargoDe(natacion.id)).toMatchObject({
      id: original!.id,
      estado: "PENDIENTE",
      monto: 6000,
      motivoAnulacion: null,
    });
  });
});

describe("con el mes siguiente ya generado", () => {
  /** El admin ya generó también 2026-11 (permitido: período actual o siguiente). */
  const siguienteGenerado = async () => {
    const otro = await f.crearSocio(club.id, { tipoSocioId: tipo.id });
    await f.crearCargo(club.id, otro.id, { periodo: "2026-11", clave: "CUOTA" });
  };
  const cargoNov = (actividadId: string) =>
    db.cargo.findUnique({ where: { socioId_periodo_clave: { socioId: socio.id, periodo: "2026-11", clave: `ACT:${actividadId}` } } });

  it("inscribirse crea también el cargo del mes siguiente", async () => {
    await periodoGenerado();
    await siguienteGenerado();
    const natacion = await f.crearActividad(club.id, { nombre: "Natación", arancel: 5000 });
    await inscribir(club.id, natacion.id, socio.id, hoy);
    expect(await cargoDe(natacion.id)).toMatchObject({ estado: "PENDIENTE", monto: 5000 });
    expect(await cargoNov(natacion.id)).toMatchObject({
      estado: "PENDIENTE",
      monto: 5000,
      descripcion: "Natación 2026-11",
      vencimiento: utc(2026, 11, 10),
    });
  });

  it("cancelar anula también el cargo pendiente del mes siguiente", async () => {
    await periodoGenerado();
    await siguienteGenerado();
    const natacion = await f.crearActividad(club.id, { arancel: 5000 });
    await inscribir(club.id, natacion.id, socio.id, hoy);
    await cancelarInscripcion(club.id, natacion.id, socio.id, hoy);
    expect((await cargoDe(natacion.id))?.estado).toBe("ANULADO");
    expect((await cargoNov(natacion.id))?.estado).toBe("ANULADO");
  });

  it("cancelar no toca cargos de meses anteriores", async () => {
    const natacion = await f.crearActividad(club.id, { arancel: 5000 });
    await f.inscribirDirecto(club.id, natacion.id, socio.id);
    const septiembre = await f.crearCargo(club.id, socio.id, {
      concepto: "ACTIVIDAD",
      actividadId: natacion.id,
      clave: `ACT:${natacion.id}`,
      periodo: "2026-09",
    });
    await cancelarInscripcion(club.id, natacion.id, socio.id, hoy);
    expect((await db.cargo.findUnique({ where: { id: septiembre.id } }))?.estado).toBe("PENDIENTE");
  });
});
