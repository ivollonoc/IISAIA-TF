// Datos de demo. Idempotente: borra todo y vuelve a crear.
// Escenario: cargos de dos meses (uno ya vencido y otro por vencer, ver escenario-demo.ts);
// Martín y Valentina al día, Lucía y Sofía con deuda por vencer, Juan moroso (no pagó el vencido).
// Pagos en efectivo, transferencia y online.
import { PrismaClient, type MedioPago, type Socio } from "@prisma/client";
import { vencimiento } from "../src/modules/cuenta-corriente/reglas";
import { DIA_MS, inicioDelDia, periodoActual } from "../src/lib/periodo";
import { formatDia, formatDiaCorto, formatPesos } from "../src/lib/format";
import { claveDia, clasesEnRango } from "../src/modules/calendario/reglas";
import { calendarioDemo, escenarioDemo, fechasDemo } from "./escenario-demo";

const prisma = new PrismaClient();

async function main() {
  await prisma.club.deleteMany();
  await prisma.usuario.deleteMany();

  // anterior = período ya vencido, actual = período por vencer (nombres del caso habitual).
  const { vencido: anterior, porVencer: actual, diaVencimiento } = escenarioDemo();
  const demo = calendarioDemo();
  const hoyMs = Date.now();
  const fechas = fechasDemo(escenarioDemo());

  const superEmail = process.env.SUPERADMIN_EMAIL || "admin@gestiondesocios.com";
  await prisma.usuario.create({ data: { email: superEmail, nombre: "Admin general", rol: "SUPERADMIN", demo: true } });

  const club = await prisma.club.create({
    data: { nombre: "Club Atlético Demo", slug: "demo", diaVencimiento, canales: ["IN_APP", "EMAIL"] },
  });
  const admin = await prisma.usuario.create({
    data: { email: "admin@demo.club", nombre: "Admin Demo", rol: "ADMIN_CLUB", clubId: club.id, demo: true },
  });

  const activo = await prisma.tipoSocio.create({ data: { clubId: club.id, nombre: "Activo", cuotaMensual: 15000 } });
  const cadete = await prisma.tipoSocio.create({ data: { clubId: club.id, nombre: "Cadete", cuotaMensual: 8000 } });

  const socioUser = await prisma.usuario.create({
    data: { email: "socio@demo.club", nombre: "Lucía Gómez", rol: "SOCIO", clubId: club.id, demo: true },
  });

  const base = [
    { nombre: "Lucía", apellido: "Gómez", dni: "30111222", tipo: activo, usuarioId: socioUser.id, email: "socio@demo.club", telefono: "+54 11 5555-0101" },
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
          email: s.email ?? null, telefono: s.telefono ?? null, tipoSocioId: s.tipo.id, usuarioId: s.usuarioId ?? null,
        },
      }),
    );
  }
  // Altas escalonadas en los últimos meses y una baja reciente (gráfico de altas y bajas).
  for (const [i, s] of socios.entries()) {
    const createdAt = new Date(hoyMs - (150 - i * 30) * DIA_MS);
    await prisma.socio.update({ where: { id: s.id }, data: { createdAt } });
  }
  await prisma.socio.create({
    data: {
      clubId: club.id, nroSocio: socios.length + 1, nombre: "Pedro", apellido: "Sosa", dni: "31555666", tipoSocioId: activo.id,
      activo: false, createdAt: new Date(hoyMs - 120 * DIA_MS), bajaAt: new Date(hoyMs - 20 * DIA_MS),
    },
  });
  // Juan (socios[3]) no paga el mes anterior: queda moroso.
  const [lucia, martin, sofia, , valentina] = socios;
  // Grupos familiares: Lucía paga por Sofía; Martín, por Valentina.
  await prisma.socio.update({ where: { id: sofia.id }, data: { titularId: lucia.id } });
  await prisma.socio.update({ where: { id: valentina.id }, data: { titularId: martin.id } });
  const cuota = (s: Socio) => (s.tipoSocioId === activo.id ? activo.cuotaMensual : cadete.cuotaMensual);

  const actividad = (nombre: string, cupo: number, precioClase: number, horarios: { diaSemana: number; hora: string }[]) =>
    prisma.actividad.create({
      data: { clubId: club.id, nombre, cupo, precioClase, fechaInicio: demo.creadas, horarios: { create: horarios } },
      include: { horarios: true },
    });
  const futbol = await actividad("Fútbol infantil", 20, 1500, [{ diaSemana: 1, hora: "18:00" }]);
  const natacion = await actividad("Natación", 2, 1250, [{ diaSemana: 1, hora: "19:00" }, { diaSemana: 3, hora: "19:00" }]);
  const yoga = await actividad("Yoga", 2, 0, [
    { diaSemana: 2, hora: "10:00" },
    { diaSemana: 4, hora: "10:00" },
  ]);

  // Cargos de dos meses, como los generaría el botón "Generar cargos".
  for (const periodo of [anterior, actual]) {
    const vence = vencimiento(periodo, diaVencimiento);
    for (const s of socios) {
      await prisma.cargo.create({
        data: {
          clubId: club.id, socioId: s.id, concepto: "CUOTA", clave: "CUOTA",
          descripcion: `Cuota social ${periodo}`, periodo, monto: cuota(s), vencimiento: vence,
          createdAt: fechas.cargo(periodo),
        },
      });
    }
  }

  async function pagar(socio: Socio, periodos: string[], medio: MedioPago, fecha: Date) {
    const cargos = await prisma.cargo.findMany({ where: { socioId: socio.id, periodo: { in: periodos } } });
    const pago = await prisma.pago.create({
      data: {
        clubId: club.id, socioId: socio.id, medio, fecha,
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

  // Fechas en el pasado (ver fechasDemo): el vencido se pagó antes de vencer; el actual, estos días.
  await pagar(martin, [anterior], "EFECTIVO", fechas.pagoVencido(0));
  await pagar(martin, [actual], "TRANSFERENCIA", fechas.pagoPorVencer(0));
  await pagar(valentina, [anterior, actual], "TRANSFERENCIA", fechas.pagoPorVencer(1));
  await pagar(sofia, [anterior], "EFECTIVO", fechas.pagoVencido(1));
  const online = await pagar(lucia, [anterior], "ONLINE", fechas.pagoVencido(2));
  await prisma.intentoPago.create({
    data: {
      clubId: club.id, socioId: lucia.id, cargoIds: online.cargos.map((c) => c.id), monto: online.pago.monto,
      estado: "APROBADO", pasarela: "simulada", referenciaExterna: "SIM-seed", ultimos4: "0001",
      createdAt: online.pago.fecha, pagos: { connect: { id: online.pago.id } },
    },
  });

  // Agenda (ver calendarioDemo): Fútbol suspendido esta semana y reprogramado la siguiente; un
  // evento informativo para todo el club y una clínica gratis con cupo solo para Natación, dentro de
  // los próximos 7 días; y una cena paga para todo el club, sin cupo, más adelante.
  const hoyDia = inicioDelDia();
  await prisma.excepcionClase.create({
    data: { clubId: club.id, actividadId: futbol.id, fecha: demo.futbol.suspendida, hora: "18:00", tipo: "SUSPENDIDA", motivo: "Feriado" },
  });
  await prisma.excepcionClase.create({
    data: {
      clubId: club.id, actividadId: futbol.id, fecha: demo.futbol.reprogramada.fecha, hora: "18:00", tipo: "REPROGRAMADA",
      nuevaFecha: demo.futbol.reprogramada.nuevaFecha, nuevaHora: "19:00", motivo: "Cancha ocupada",
    },
  });
  // Reservas de las próximas clases (las que todavía no empezaron): Lucía va a Natación; Sofía,
  // a Fútbol (incluye la clase suspendida y la reprogramada); Martín y Valentina llenan la próxima
  // clase de Yoga y Lucía queda en su lista de espera. Las clases pagas generan su cargo.
  const ahora = Date.now();
  const proximas = (a: typeof natacion, n: number) =>
    clasesEnRango(a, hoyDia, new Date(hoyDia.getTime() + 28 * DIA_MS))
      .filter(({ fecha, horario }) => {
        const [h, m] = horario.hora.split(":").map(Number);
        return fecha.getTime() + (h + 3) * 3_600_000 + m * 60_000 > ahora;
      })
      .slice(0, n);
  async function reservarDemo(s: Socio, a: typeof natacion, n: number) {
    const suspendidas = await prisma.excepcionClase.findMany({ where: { actividadId: a.id, tipo: "SUSPENDIDA" } });
    for (const { fecha, horario } of proximas(a, n)) {
      await prisma.reserva.create({ data: { clubId: club.id, actividadId: a.id, socioId: s.id, fecha, hora: horario.hora } });
      const suspendida = suspendidas.some((e) => e.fecha.getTime() === fecha.getTime() && e.hora === horario.hora);
      if (a.precioClase > 0 && !suspendida) {
        await prisma.cargo.create({
          data: {
            clubId: club.id, socioId: s.id, concepto: "CLASE", actividadId: a.id,
            clave: `CLA:${a.id}:${claveDia(fecha)}:${horario.hora}`, descripcion: `${a.nombre} ${formatDiaCorto(fecha)} ${horario.hora}`,
            periodo: periodoActual(), monto: a.precioClase, vencimiento: fecha,
          },
        });
      }
    }
  }
  await reservarDemo(lucia, natacion, 4);
  await reservarDemo(sofia, futbol, 2);
  await reservarDemo(martin, yoga, 1);
  await reservarDemo(valentina, yoga, 1);
  // Historia: reservas de las últimas 3 semanas (ocupación en los reportes) y puntajes de quienes fueron.
  const pasadas = (a: typeof natacion) =>
    clasesEnRango(a, new Date(hoyDia.getTime() - 21 * DIA_MS), hoyDia).filter(({ fecha, horario }) => {
      const [h, m] = horario.hora.split(":").map(Number);
      return fecha.getTime() + (h + 3) * 3_600_000 + m * 60_000 < ahora;
    });
  const historia: [Socio[], typeof natacion][] = [[[lucia, martin], natacion], [[martin, valentina], yoga], [[sofia], futbol]];
  for (const [quienes, a] of historia) {
    for (const { fecha, horario } of pasadas(a)) {
      for (const s of quienes) {
        await prisma.reserva.create({ data: { clubId: club.id, actividadId: a.id, socioId: s.id, fecha, hora: horario.hora } });
      }
    }
  }
  const puntajes: [Socio, typeof natacion, number, string | null][] = [
    [lucia, natacion, 8, "Muy buena la profe; la pileta un poco fría"],
    [martin, natacion, 9, null],
    [martin, yoga, 9, "Excelente para arrancar el día"],
    [valentina, yoga, 10, null],
    [sofia, futbol, 7, "Me gustaría que sea dos veces por semana"],
  ];
  for (const [s, a, medias, comentario] of puntajes) {
    await prisma.puntaje.create({ data: { clubId: club.id, actividadId: a.id, socioId: s.id, medias, comentario } });
  }

  const [claseYoga] = proximas(yoga, 1);
  await prisma.listaEspera.create({
    data: { clubId: club.id, actividadId: yoga.id, socioId: lucia.id, fecha: claseYoga.fecha, hora: claseYoga.horario.hora },
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

  // Avisos de ejemplo para Lucía (sin leer), con su copia por mail en el buzón de salida.
  const deudaActual = cuota(lucia);
  const avisos = [
    {
      tipo: "CARGOS_GENERADOS", titulo: `Ya podés pagar ${actual}`, link: "/c/demo/socio",
      cuerpo: `Tenés ${formatPesos(deudaActual)} a pagar, vence el ${formatDia(vencimiento(actual, diaVencimiento))}.`,
    },
    {
      tipo: "EVENTO_NUEVO", titulo: "Nuevo evento: Cena anual", link: "/c/demo/socio/actividades",
      cuerpo: "Cena de fin de temporada en la Sede social. Inscribite desde Actividades y eventos.",
    },
  ];
  for (const [i, a] of avisos.entries()) {
    const createdAt = new Date(Date.now() - (avisos.length - i) * 60_000);
    await prisma.notificacion.create({ data: { ...a, usuarioId: socioUser.id, clubId: club.id, createdAt } });
    await prisma.mensajeSaliente.create({
      data: {
        clubId: club.id, canal: "EMAIL", destino: "socio@demo.club", asunto: a.titulo, proveedor: "simulado", createdAt,
        cuerpo: `${a.cuerpo}

Ver en la app: ${a.link}`,
      },
    });
  }

  console.log(`Seed OK. Logins demo: ${superEmail} | admin@demo.club | socio@demo.club`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
