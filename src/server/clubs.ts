// Gestión de clubes (solo SUPERADMIN).
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { clubSchema } from "@/lib/validation";

export function listarClubs() {
  return db.club.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      usuarios: { where: { rol: "ADMIN_CLUB" }, select: { email: true } },
      _count: { select: { socios: true } },
    },
  });
}

/** Crea el club y da de alta (o reasigna) a su usuario administrador. */
export async function crearClub(input: unknown) {
  const data = clubSchema.parse(input);

  return db.$transaction(async (tx) => {
    const existente = await tx.usuario.findUnique({ where: { email: data.adminEmail } });
    if (existente && existente.rol !== "ADMIN_CLUB") {
      throw new DomainError("Ese email ya está en uso por otro tipo de usuario");
    }
    if (existente?.clubId) throw new DomainError("Ese email ya administra otro club");

    const club = await tx.club.create({ data: { nombre: data.nombre, slug: data.slug } });
    await tx.usuario.upsert({
      where: { email: data.adminEmail },
      update: { clubId: club.id },
      create: { email: data.adminEmail, rol: "ADMIN_CLUB", clubId: club.id },
    });
    return club;
  });
}
