// Tipos de socio y su cuota mensual, por club.
import { db } from "@/lib/db";
import { tipoSocioSchema } from "@/lib/validation";

export function listarTipos(clubId: string) {
  return db.tipoSocio.findMany({
    where: { clubId },
    orderBy: { nombre: "asc" },
    include: { _count: { select: { socios: true } } },
  });
}

export function crearTipo(clubId: string, input: unknown) {
  const data = tipoSocioSchema.parse(input);
  return db.tipoSocio.create({ data: { ...data, clubId } });
}
