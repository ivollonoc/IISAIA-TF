// Datos de demo. Idempotente: borra todo y vuelve a crear.
import { PrismaClient } from "@prisma/client";
import { periodoActual } from "../src/lib/periodo";

const prisma = new PrismaClient();

async function main() {
  await prisma.club.deleteMany();
  await prisma.usuario.deleteMany();

  const superEmail = process.env.SUPERADMIN_EMAIL || "admin@gestiondesocios.com";
  await prisma.usuario.create({ data: { email: superEmail, nombre: "Admin general", rol: "SUPERADMIN" } });

  const club = await prisma.club.create({ data: { nombre: "Club Atlético Demo", slug: "demo" } });
  await prisma.usuario.create({
    data: { email: "admin@demo.club", nombre: "Admin Demo", rol: "ADMIN_CLUB", clubId: club.id },
  });

  const activo = await prisma.tipoSocio.create({ data: { clubId: club.id, nombre: "Activo", cuotaMensual: 15000 } });
  const cadete = await prisma.tipoSocio.create({ data: { clubId: club.id, nombre: "Cadete", cuotaMensual: 8000 } });

  const socioUser = await prisma.usuario.create({
    data: { email: "socio@demo.club", nombre: "Lucía Gómez", rol: "SOCIO", clubId: club.id },
  });

  const base = [
    { nombre: "Lucía", apellido: "Gómez", dni: "30111222", tipo: activo, usuarioId: socioUser.id, email: "socio@demo.club" },
    { nombre: "Martín", apellido: "Pérez", dni: "28999888", tipo: activo },
    { nombre: "Sofía", apellido: "Díaz", dni: "45123456", tipo: cadete },
    { nombre: "Juan", apellido: "López", dni: "33444555", tipo: activo },
    { nombre: "Valentina", apellido: "Ruiz", dni: "46777888", tipo: cadete },
  ];

  const socios = [];
  for (const [i, s] of base.entries()) {
    socios.push(
      await prisma.socio.create({
        data: {
          clubId: club.id, nroSocio: i + 1, nombre: s.nombre, apellido: s.apellido, dni: s.dni,
          email: s.email ?? null, tipoSocioId: s.tipo.id, usuarioId: s.usuarioId ?? null,
        },
      }),
    );
  }

  // 3 de 5 socios al día con el período actual
  const periodo = periodoActual();
  for (const s of socios.slice(0, 3)) {
    const tipo = base.find((b) => b.dni === s.dni)!.tipo;
    await prisma.pago.create({
      data: { clubId: club.id, socioId: s.id, periodo, monto: tipo.cuotaMensual, medio: "TRANSFERENCIA" },
    });
  }

  const futbol = await prisma.actividad.create({
    data: { clubId: club.id, nombre: "Fútbol infantil", diaSemana: 1, hora: "18:00", cupo: 20 },
  });
  await prisma.actividad.create({ data: { clubId: club.id, nombre: "Natación", diaSemana: 3, hora: "19:00", cupo: 2 } });
  await prisma.actividad.create({ data: { clubId: club.id, nombre: "Yoga", diaSemana: 6, hora: "10:00", cupo: 15 } });

  await prisma.inscripcion.create({ data: { clubId: club.id, actividadId: futbol.id, socioId: socios[2].id } });

  console.log(`Seed OK. Logins demo: ${superEmail} | admin@demo.club | socio@demo.club`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
