// Datos de demo. Idempotente: borra todo y vuelve a crear.
// Escenario: cargos de dos meses (uno ya vencido y otro por vencer, ver escenario-demo.ts);
// Martín y Valentina al día, Lucía y Sofía con deuda por vencer, Juan moroso (no pagó el vencido).
// Pagos en efectivo, transferencia y online.
import { PrismaClient, type MedioPago, type Socio } from "@prisma/client";
import { vencimiento } from "../src/modules/cuenta-corriente/reglas";
import { DIA_MS, inicioDelDia } from "../src/lib/periodo";
import { calendarioDemo, escenarioDemo } from "./escenario-demo";

const prisma = new PrismaClient();

async function main() {
  await prisma.club.deleteMany();
  await prisma.usuario.deleteMany();

  // anterior = período ya vencido, actual = período por vencer (nombres del caso habitual).
  const { vencido: anterior, porVencer: actual, diaVencimiento } = escenarioDemo();
  const demo = calendarioDemo();

  const superEmail = process.env.SUPERADMIN_EMAIL || "admin@gestiondesocios.com";
  await prisma.usuario.create({ data: { email: superEmail, nombre: "Admin general", rol: "SUPERADMIN" } });

  const club = await prisma.club.create({ data: { nombre: "Club Atlético Demo", slug: "demo", diaVencimiento } });
  const admin = await prisma.usuario.create({
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

  const socios: Socio[] = [];
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
  // Juan (socios[3]) no paga el mes anterior: queda moroso.
  const [lucia, martin, sofia, , valentina] = socios;
  const cuota = (s: Socio) => (s.tipoSocioId === activo.id ? activo.cuotaMensual : cadete.cuotaMensual);

  const actividad = (nombre: string, cupo: number, arancel: number, horarios: { diaSemana: number; hora: string }[]) =>
    prisma.actividad.create({
      data: { clubId: club.id, nombre, cupo, arancel, fechaInicio: demo.creadas, horarios: { create: horarios } },
    });
  const futbol = await actividad("Fútbol infantil", 20, 6000, [{ diaSemana: 1, hora: "18:00" }]);
  const natacion = await actividad("Natación", 2, 5000, [{ diaSemana: 1, hora: "19:00" }, { diaSemana: 3, hora: "19:00" }]);
  // Yoga gratis y lleno (Martín y Valentina): Lucía espera un lugar.
  const yoga = await actividad("Yoga", 2, 0, [
    { diaSemana: 2, hora: "10:00" },
    { diaSemana: 4, hora: "10:00" },
  ]);

  await prisma.inscripcion.create({ data: { clubId: club.id, actividadId: futbol.id, socioId: sofia.id } });
  await prisma.inscripcion.create({ data: { clubId: club.id, actividadId: natacion.id, socioId: lucia.id } });
  for (const s of [martin, valentina]) {
    await prisma.inscripcion.create({ data: { clubId: club.id, actividadId: yoga.id, socioId: s.id } });
  }
  await prisma.listaEspera.create({ data: { clubId: club.id, actividadId: yoga.id, socioId: lucia.id } });

  // Cargos de dos meses, como los generaría el botón "Generar cargos".
  for (const periodo of [anterior, actual]) {
    const vence = vencimiento(periodo, diaVencimiento);
    for (const s of socios) {
      await prisma.cargo.create({
        data: {
          clubId: club.id, socioId: s.id, concepto: "CUOTA", clave: "CUOTA",
          descripcion: `Cuota social ${periodo}`, periodo, monto: cuota(s), vencimiento: vence,
        },
      });
    }
    for (const [s, a] of [[sofia, futbol], [lucia, natacion]] as const) {
      await prisma.cargo.create({
        data: {
          clubId: club.id, socioId: s.id, concepto: "ACTIVIDAD", actividadId: a.id, clave: `ACT:${a.id}`,
          descripcion: `${a.nombre} ${periodo}`, periodo, monto: a.arancel, vencimiento: vence,
        },
      });
    }
  }

  async function pagar(socio: Socio, periodos: string[], medio: MedioPago) {
    const cargos = await prisma.cargo.findMany({ where: { socioId: socio.id, periodo: { in: periodos } } });
    const pago = await prisma.pago.create({
      data: {
        clubId: club.id, socioId: socio.id, medio,
        monto: cargos.reduce((s, c) => s + c.monto, 0),
        registradoPor: medio === "ONLINE" ? null : admin.id,
      },
    });
    await prisma.cargo.updateMany({
      where: { id: { in: cargos.map((c) => c.id) } },
      data: { estado: "PAGADO", pagoId: pago.id },
    });
    return { pago, cargos };
  }

  await pagar(martin, [anterior], "EFECTIVO");
  await pagar(martin, [actual], "TRANSFERENCIA");
  await pagar(valentina, [anterior, actual], "TRANSFERENCIA");
  await pagar(sofia, [anterior], "EFECTIVO");
  const online = await pagar(lucia, [anterior], "ONLINE");
  await prisma.intentoPago.create({
    data: {
      clubId: club.id, socioId: lucia.id, cargoIds: online.cargos.map((c) => c.id), monto: online.pago.monto,
      estado: "APROBADO", pasarela: "simulada", referenciaExterna: "SIM-seed", ultimos4: "0001", pagoId: online.pago.id,
    },
  });

  // Agenda (ver calendarioDemo): Fútbol suspendido esta semana y reprogramado la siguiente; un
  // evento informativo para todo el club y una clínica gratis con cupo solo para Natación, dentro de
  // los próximos 7 días; y una cena paga para todo el club, sin cupo, más adelante.
  const hoyDia = inicioDelDia();
  await prisma.excepcionClase.create({
    data: { clubId: club.id, actividadId: futbol.id, fecha: demo.futbol.suspendida, tipo: "SUSPENDIDA", motivo: "Feriado" },
  });
  await prisma.excepcionClase.create({
    data: {
      clubId: club.id, actividadId: futbol.id, fecha: demo.futbol.reprogramada.fecha, tipo: "REPROGRAMADA",
      nuevaFecha: demo.futbol.reprogramada.nuevaFecha, nuevaHora: "19:00", motivo: "Cancha ocupada",
    },
  });
  await prisma.evento.create({
    data: {
      clubId: club.id, titulo: "Asamblea anual", fecha: new Date(hoyDia.getTime() + 3 * DIA_MS), hora: "20:00",
      lugar: "Sede social", descripcion: "Balance y elección de autoridades",
    },
  });
  await prisma.evento.create({
    data: {
      clubId: club.id, titulo: "Clínica de natación", fecha: new Date(hoyDia.getTime() + 5 * DIA_MS), hora: "10:00",
      duracionMin: 120, lugar: "Pileta", actividadId: natacion.id, conInscripcion: true, cupo: 10,
    },
  });
  await prisma.evento.create({
    data: {
      clubId: club.id, titulo: "Cena anual", fecha: new Date(hoyDia.getTime() + 12 * DIA_MS), hora: "21:00",
      duracionMin: 180, lugar: "Sede social", descripcion: "Cena de fin de temporada con show en vivo",
      conInscripcion: true, precio: 15000,
    },
  });

  console.log(`Seed OK. Logins demo: ${superEmail} | admin@demo.club | socio@demo.club`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
