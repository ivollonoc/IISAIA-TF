import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { demoHabilitado } from "@/lib/auth";
import { formatDiaCorto, formatPesos } from "@/lib/format";
import { inicioDelDia } from "@/lib/periodo";
import { homePath } from "@/lib/permisos";
import { getUsuario } from "@/lib/session";
import { LoginHome } from "@/modules/acceso/components/LoginHome";
import { formatHorarios } from "@/modules/calendario/components/etiquetas";
import { horaFin } from "@/modules/calendario/reglas";
import { Card } from "@/components/ui";

const ERRORES: Record<string, string> = { CredentialsSignin: "El link no es válido o ya venció. Pedí uno nuevo." };

/** Página pública del club (en su subdominio es la portada): actividades, eventos e ingreso. */
export default async function ClubPublicoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const club = await db.club.findUnique({ where: { slug } });
  if (!club) notFound();
  const user = await getUsuario();
  if (user && (user.clubId === club.id || user.rol === "SUPERADMIN")) redirect(homePath(user));
  const { error } = await searchParams;

  const hoy = inicioDelDia();
  const [actividades, eventos] = await Promise.all([
    db.actividad.findMany({
      where: { clubId: club.id, activa: true, OR: [{ fechaFin: null }, { fechaFin: { gte: hoy } }] },
      orderBy: { nombre: "asc" },
      include: { horarios: true },
    }),
    db.evento.findMany({
      where: { clubId: club.id, actividadId: null, fecha: { gte: hoy } },
      orderBy: [{ fecha: "asc" }, { hora: "asc" }],
      take: 5,
    }),
  ]);

  return (
    <div className="grid gap-8 py-4 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">Bienvenido a</p>
          <h1 className="text-4xl font-bold text-slate-900">{club.nombre}</h1>
          <p className="mt-2 text-slate-600">Reservá tus clases, pagá tu cuota online y enterate de todo lo que pasa en el club.</p>
        </div>
        <Card title="Actividades">
          {actividades.length === 0 ? (
            <p className="text-sm text-slate-500">Pronto vamos a publicar las actividades.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {actividades.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium text-slate-800">{a.nombre}</span>
                    {a.descripcion && <span className="text-slate-500"> · {a.descripcion}</span>}
                  </span>
                  <span className="text-slate-600">
                    {formatHorarios(a.horarios)} · {a.precioClase > 0 ? `${formatPesos(a.precioClase)} por clase` : "Gratis"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {eventos.length > 0 && (
          <Card title="Próximos eventos">
            <ul className="flex flex-col gap-2 text-sm">
              {eventos.map((e) => (
                <li key={e.id}>
                  <span className="font-medium text-slate-800">{e.titulo}</span>{" "}
                  <span className="text-slate-600">
                    · {formatDiaCorto(e.fecha)} {e.hora}–{horaFin(e.hora, e.duracionMin)}
                    {e.lugar && ` · ${e.lugar}`}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <Card title="Ingresar">
        <LoginHome demo={demoHabilitado} club={club.slug} error={error ? (ERRORES[error] ?? "No se pudo iniciar sesión.") : undefined} />
      </Card>
    </div>
  );
}
