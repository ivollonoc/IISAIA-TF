// Reportes: del club (recaudación, morosidad, ocupación, puntajes, altas y bajas) y global (sin
// información financiera de los clubes). Los agregados se calculan en consulta.
import { db } from "@/lib/db";
import { DIA_MS, inicioDelDia, periodoActual, periodoAnterior } from "@/lib/periodo";
import { clasesEnRango, claveDia } from "@/modules/calendario/reglas";
import { estadoSocios } from "@/modules/cuenta-corriente/consultas.service";
import { rangoDelMes } from "@/modules/cuenta-corriente/reglas";
import { promedioEstrellas } from "@/modules/actividades/puntajes.service";

/** Los últimos `n` períodos ("AAAA-MM"), del más viejo al actual. */
export function ultimosPeriodos(n: number, hoy: Date = new Date()): string[] {
  const periodos = [periodoActual(hoy)];
  while (periodos.length < n) periodos.unshift(periodoAnterior(periodos[0]));
  return periodos;
}

/** Período ("AAAA-MM") de un instante, en el calendario de Argentina. */
const periodoDe = (instante: Date) => periodoActual(instante);

export async function reporteClub(clubId: string, meses: number, hoy: Date = new Date()) {
  const periodos = ultimosPeriodos(meses, hoy);
  const desdeMeses = rangoDelMes(periodos[0]).desde;
  const hoyDia = inicioDelDia(hoy);
  const hace4Semanas = new Date(hoyDia.getTime() - 28 * DIA_MS);

  const [cargos, pagos, estados, socios, actividades, reservas, suspendidas, esperas, puntajes] = await Promise.all([
    db.cargo.groupBy({ by: ["periodo"], where: { clubId, periodo: { in: periodos }, estado: { not: "ANULADO" } }, _sum: { monto: true } }),
    db.pago.findMany({ where: { clubId, fecha: { gte: desdeMeses } }, select: { fecha: true, monto: true } }),
    estadoSocios(clubId, hoy),
    db.socio.findMany({ where: { clubId }, select: { id: true, nombre: true, apellido: true, activo: true, createdAt: true, bajaAt: true } }),
    db.actividad.findMany({ where: { clubId, activa: true }, include: { horarios: true }, orderBy: { nombre: "asc" } }),
    db.reserva.groupBy({ by: ["actividadId", "fecha", "hora"], where: { clubId, fecha: { gte: hace4Semanas, lte: hoyDia } }, _count: { _all: true } }),
    db.excepcionClase.findMany({ where: { clubId, tipo: "SUSPENDIDA", fecha: { gte: hace4Semanas, lte: hoyDia } } }),
    db.listaEspera.groupBy({ by: ["actividadId"], where: { clubId, actividadId: { not: null }, fecha: { gte: hoyDia } }, _count: { _all: true } }),
    db.puntaje.findMany({ where: { clubId }, select: { actividadId: true, medias: true } }),
  ]);

  const cobradoPorPeriodo = new Map<string, number>();
  for (const p of pagos) cobradoPorPeriodo.set(periodoDe(p.fecha), (cobradoPorPeriodo.get(periodoDe(p.fecha)) ?? 0) + p.monto);
  const recaudacion = periodos.map((periodo) => ({
    periodo,
    emitido: cargos.find((c) => c.periodo === periodo)?._sum.monto ?? 0,
    cobrado: cobradoPorPeriodo.get(periodo) ?? 0,
  }));

  const activos = socios.filter((s) => s.activo);
  const morosos = activos
    .filter((s) => estados[s.id]?.moroso)
    .map((s) => ({ socioId: s.id, nombre: s.nombre, apellido: s.apellido, deudaVencida: 0 }));
  const vencidos = await db.cargo.groupBy({
    by: ["socioId"],
    where: { clubId, estado: "PENDIENTE", vencimiento: { lt: hoyDia }, socioId: { in: morosos.map((m) => m.socioId) } },
    _sum: { monto: true },
  });
  for (const m of morosos) m.deudaVencida = vencidos.find((v) => v.socioId === m.socioId)?._sum.monto ?? 0;
  morosos.sort((a, b) => b.deudaVencida - a.deudaVencida);

  // Ocupación: clases de las últimas 4 semanas que ya empezaron (sin las suspendidas).
  const k = (actividadId: string, fecha: Date, hora: string) => `${actividadId}|${claveDia(fecha)}|${hora}`;
  const ocupadas = new Map(reservas.map((r) => [k(r.actividadId, r.fecha, r.hora), r._count._all]));
  const suspendida = new Set(suspendidas.map((e) => k(e.actividadId, e.fecha, e.hora)));
  const ocupacion = actividades.map((a) => {
    const clases = clasesEnRango(a, hace4Semanas, hoyDia).filter(({ fecha, horario }) => {
      const [h, m] = horario.hora.split(":").map(Number);
      const inicio = fecha.getTime() + (h + 3) * 3_600_000 + m * 60_000;
      return inicio <= hoy.getTime() && !suspendida.has(k(a.id, fecha, horario.hora));
    });
    const reservasHechas = clases.reduce((n, c) => n + (ocupadas.get(k(a.id, c.fecha, c.horario.hora)) ?? 0), 0);
    const lugares = clases.length * a.cupo;
    return {
      actividadId: a.id, actividad: a.nombre, clases: clases.length, lugares, reservas: reservasHechas,
      porcentaje: lugares ? Math.round((reservasHechas / lugares) * 100) : 0,
      enEspera: esperas.find((e) => e.actividadId === a.id)?._count._all ?? 0,
    };
  });

  const puntajesPorActividad = actividades.map((a) => {
    const deEsta = puntajes.filter((p) => p.actividadId === a.id).map((p) => p.medias);
    return { actividad: a.nombre, promedio: promedioEstrellas(deEsta), votos: deEsta.length };
  });

  const altasBajas = periodos.map((periodo) => ({
    periodo,
    altas: socios.filter((s) => periodoDe(s.createdAt) === periodo).length,
    bajas: socios.filter((s) => s.bajaAt && periodoDe(s.bajaAt) === periodo).length,
  }));

  const deudaVencida = morosos.reduce((s, m) => s + m.deudaVencida, 0);
  return {
    periodos,
    kpis: {
      activos: activos.length,
      recaudadoMes: recaudacion.at(-1)!.cobrado,
      deudaVencida,
      porcentajeAlDia: activos.length ? Math.round(((activos.length - morosos.length) / activos.length) * 100) : 100,
    },
    recaudacion,
    morosos: morosos.slice(0, 10),
    ocupacion,
    puntajes: puntajesPorActividad,
    altasBajas,
  };
}

/** Reporte del admin general: actividad de cada club, sin información de dinero. */
export async function reporteGlobal(meses: number, hoy: Date = new Date()) {
  const periodos = ultimosPeriodos(meses, hoy);
  const hoyDia = inicioDelDia(hoy);
  const hace4Semanas = new Date(hoyDia.getTime() - 28 * DIA_MS);
  const [clubes, socios, reservas] = await Promise.all([
    db.club.findMany({
      orderBy: { nombre: "asc" },
      select: {
        id: true, nombre: true, slug: true,
        _count: { select: { socios: { where: { activo: true } }, actividades: { where: { activa: true } } } },
      },
    }),
    db.socio.findMany({ where: { createdAt: { gte: rangoDelMes(periodos[0]).desde } }, select: { createdAt: true } }),
    db.reserva.groupBy({ by: ["clubId"], where: { fecha: { gte: hace4Semanas, lte: hoyDia } }, _count: { _all: true } }),
  ]);
  const filas = clubes.map((c) => ({
    nombre: c.nombre, slug: c.slug,
    sociosActivos: c._count.socios, actividades: c._count.actividades,
    reservas4Semanas: reservas.find((r) => r.clubId === c.id)?._count._all ?? 0,
  }));
  return {
    periodos,
    totales: {
      clubes: filas.length,
      sociosActivos: filas.reduce((s, c) => s + c.sociosActivos, 0),
      actividades: filas.reduce((s, c) => s + c.actividades, 0),
      reservas4Semanas: filas.reduce((s, c) => s + c.reservas4Semanas, 0),
    },
    clubes: filas,
    altasPorMes: periodos.map((periodo) => ({ periodo, altas: socios.filter((s) => periodoDe(s.createdAt) === periodo).length })),
  };
}
