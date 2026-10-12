// Consultas de cuenta corriente: por socio, por club y resumen del tablero.
import type { EstadoCargo } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { periodoActual } from "@/lib/periodo";
import { estaAlDia, estaVencido, inicioDelDia, rangoDelMes, saldoAcumulado, type Movimiento } from "./reglas";

type MovimientoCuenta = Movimiento & { estado: EstadoCargo | null; vencido: boolean };

/** Cuenta corriente de un socio: movimientos con saldo, cargos pendientes y deuda. */
export async function cuentaSocio(clubId: string, socioId: string, hoy: Date = new Date()) {
  const socio = await db.socio.findFirst({ where: { id: socioId, clubId }, select: { id: true } });
  if (!socio) throw new DomainError("Socio no encontrado");

  const [cargos, pagos] = await Promise.all([
    db.cargo.findMany({ where: { clubId, socioId }, orderBy: [{ vencimiento: "asc" }, { createdAt: "asc" }] }),
    db.pago.findMany({ where: { clubId, socioId }, orderBy: { fecha: "asc" } }),
  ]);

  const movs: MovimientoCuenta[] = [
    ...cargos.map((c) => ({
      id: c.id,
      fecha: c.createdAt,
      tipo: "CARGO" as const,
      concepto: c.descripcion,
      monto: c.monto,
      anulado: c.estado === "ANULADO",
      estado: c.estado,
      vencido: estaVencido(c, hoy),
    })),
    ...pagos.map((p) => ({
      id: p.id,
      fecha: p.fecha,
      tipo: "PAGO" as const,
      concepto: `Pago (${p.medio.toLowerCase()})`,
      monto: p.monto,
      anulado: false,
      estado: null,
      vencido: false,
    })),
  ];

  const pendientes = cargos.filter((c) => c.estado === "PENDIENTE").map((c) => ({ ...c, vencido: estaVencido(c, hoy) }));
  const suma = (cs: { monto: number }[]) => cs.reduce((s, c) => s + c.monto, 0);

  return {
    movimientos: saldoAcumulado(movs),
    pendientes,
    deuda: suma(pendientes),
    deudaVencida: suma(pendientes.filter((c) => c.vencido)),
    proximoVencimiento: pendientes.find((c) => !c.vencido)?.vencimiento ?? null,
    alDia: estaAlDia(cargos, hoy),
  };
}

export type CuentaSocio = Awaited<ReturnType<typeof cuentaSocio>>;

/** Deuda pendiente y morosidad de cada socio del club con cargos pendientes. */
export async function estadoSocios(clubId: string, hoy: Date = new Date()) {
  const corte = inicioDelDia(hoy);
  const [deudas, vencidos] = await Promise.all([
    db.cargo.groupBy({ by: ["socioId"], where: { clubId, estado: "PENDIENTE" }, _sum: { monto: true } }),
    db.cargo.groupBy({
      by: ["socioId"],
      where: { clubId, estado: "PENDIENTE", vencimiento: { lt: corte } },
      _count: { _all: true },
    }),
  ]);
  const morosos = new Set(vencidos.map((v) => v.socioId));
  const estados: Record<string, { deuda: number; moroso: boolean }> = {};
  for (const d of deudas) estados[d.socioId] = { deuda: d._sum.monto ?? 0, moroso: morosos.has(d.socioId) };
  return estados;
}

/** Indicadores del tablero del club para el mes en curso. */
export async function resumenClub(clubId: string, hoy: Date = new Date()) {
  const periodo = periodoActual(hoy);
  const { desde, hasta } = rangoDelMes(periodo);
  const vencidoAntesDeHoy = { estado: "PENDIENTE" as const, vencimiento: { lt: inicioDelDia(hoy) } };
  const [activos, morosos, deudaVencida, recaudado, actividades] = await Promise.all([
    db.socio.count({ where: { clubId, activo: true } }),
    db.socio.count({ where: { clubId, activo: true, cargos: { some: vencidoAntesDeHoy } } }),
    db.cargo.aggregate({ where: { clubId, ...vencidoAntesDeHoy }, _sum: { monto: true } }),
    db.pago.aggregate({ where: { clubId, fecha: { gte: desde, lt: hasta } }, _sum: { monto: true } }),
    db.actividad.count({ where: { clubId, activa: true } }),
  ]);
  return {
    periodo,
    activos,
    alDia: activos - morosos,
    morosos,
    deudaVencida: deudaVencida._sum.monto ?? 0,
    recaudado: recaudado._sum.monto ?? 0,
    actividades,
  };
}

/** Cuenta del club: lo cobrado en el mes (acreditaciones) y la deuda de los socios. */
export async function cuentaClub(clubId: string, hoy: Date = new Date()) {
  const periodo = periodoActual(hoy);
  const { desde, hasta } = rangoDelMes(periodo);
  const [acreditaciones, pendiente, vencida, intentosSinPago] = await Promise.all([
    db.pago.findMany({
      where: { clubId, fecha: { gte: desde, lt: hasta } },
      orderBy: { fecha: "desc" },
      include: { socio: { select: { nombre: true, apellido: true, nroSocio: true } } },
    }),
    db.cargo.aggregate({ where: { clubId, estado: "PENDIENTE" }, _sum: { monto: true } }),
    db.cargo.aggregate({
      where: { clubId, estado: "PENDIENTE", vencimiento: { lt: inicioDelDia(hoy) } },
      _sum: { monto: true },
    }),
    db.intentoPago.count({ where: { clubId, estado: "APROBADO", pagoId: null } }),
  ]);
  const suma = (ps: { monto: number }[]) => ps.reduce((s, p) => s + p.monto, 0);
  return {
    periodo,
    cobrado: suma(acreditaciones),
    cobradoOnline: suma(acreditaciones.filter((p) => p.medio === "ONLINE")),
    cobradoVentanilla: suma(acreditaciones.filter((p) => p.medio !== "ONLINE")),
    deudaPendiente: pendiente._sum.monto ?? 0,
    deudaVencida: vencida._sum.monto ?? 0,
    acreditaciones,
    intentosSinPago,
  };
}

export type CuentaClubData = Awaited<ReturnType<typeof cuentaClub>>;
