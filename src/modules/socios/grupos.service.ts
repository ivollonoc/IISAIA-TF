// Grupos familiares: un titular y sus familiares (un solo nivel, mismo club). El titular es quien
// paga los cargos de todo el grupo.
import { z } from "zod";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { estaVencido } from "@/modules/cuenta-corriente/reglas";

const grupoSchema = z.object({ titularId: z.string().min(1, "Elegí el titular"), socioId: z.string().min(1, "Elegí el socio") });

export async function agregarAlGrupo(clubId: string, input: unknown) {
  const { titularId, socioId } = grupoSchema.parse(input);
  if (titularId === socioId) throw new DomainError("Un socio no puede ser su propio familiar");
  const [titular, socio] = await Promise.all([
    db.socio.findFirst({ where: { id: titularId, clubId } }),
    db.socio.findFirst({ where: { id: socioId, clubId }, include: { _count: { select: { familiares: true } } } }),
  ]);
  if (!titular || !socio) throw new DomainError("Socio no encontrado");
  if (titular.titularId) throw new DomainError("El titular ya es familiar de otro socio");
  if (socio.titularId) throw new DomainError("Ese socio ya está en un grupo familiar");
  if (socio._count.familiares > 0) throw new DomainError("Ese socio es titular de otro grupo");
  await db.socio.update({ where: { id: socioId }, data: { titularId } });
}

export async function quitarDelGrupo(clubId: string, socioId: string) {
  const { count } = await db.socio.updateMany({ where: { id: socioId, clubId, titularId: { not: null } }, data: { titularId: null } });
  if (count === 0) throw new DomainError("Ese socio no está en un grupo familiar");
}

/** Socios cuyos cargos puede pagar `socioId`: él mismo y, si es titular, sus familiares. */
export async function integrantesDelGrupo(clubId: string, socioId: string) {
  const socio = await db.socio.findFirst({
    where: { id: socioId, clubId },
    include: { familiares: { orderBy: { nroSocio: "asc" } } },
  });
  if (!socio) throw new DomainError("Socio no encontrado");
  const { familiares, ...titular } = socio;
  return [titular, ...familiares];
}

/** Cargos pendientes de todo el grupo (para la pestaña Pagos del titular), por vencimiento. */
export async function pendientesDelGrupo(clubId: string, socioId: string, hoy: Date = new Date()) {
  const integrantes = await integrantesDelGrupo(clubId, socioId);
  const cargos = await db.cargo.findMany({
    where: { clubId, socioId: { in: integrantes.map((s) => s.id) }, estado: "PENDIENTE" },
    orderBy: [{ vencimiento: "asc" }, { createdAt: "asc" }],
    include: { socio: { select: { nombre: true, apellido: true } } },
  });
  const pendientes = cargos.map((c) => ({ ...c, vencido: estaVencido(c, hoy) }));
  return { integrantes, pendientes, total: pendientes.reduce((s, c) => s + c.monto, 0) };
}

/** Indicadores y lista de grupos del club (titulares con al menos un familiar). */
export async function resumenGrupos(clubId: string) {
  const titulares = await db.socio.findMany({
    where: { clubId, familiares: { some: {} } },
    orderBy: { nroSocio: "asc" },
    include: { familiares: { orderBy: { nroSocio: "asc" } } },
  });
  const lista = titulares.map(({ familiares, ...titular }) => ({ titular, familiares }));
  const sociosEnGrupos = lista.reduce((n, g) => n + 1 + g.familiares.length, 0);
  return {
    grupos: lista.length,
    sociosEnGrupos,
    tamanioMedio: lista.length ? Math.round((sociosEnGrupos / lista.length) * 10) / 10 : 0,
    lista,
  };
}
