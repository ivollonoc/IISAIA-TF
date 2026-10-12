import Link from "next/link";
import { leerAviso } from "@/lib/aviso";
import { requireSuperadmin } from "@/lib/session";
import { listarClubs } from "@/modules/clubs/service";
import { enviarAvisoPlataformaAction } from "@/modules/notificaciones/actions";
import { BuzonSalida } from "@/modules/notificaciones/components/BuzonSalida";
import { buzonSalida } from "@/modules/notificaciones/service";
import { Aviso, Boton, Campo, Card, Selector, Titulo, type SearchParams } from "@/components/ui";

export default async function AvisosPlataformaPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSuperadmin();
  const [clubs, buzon, msg] = await Promise.all([listarClubs(), buzonSalida(null), searchParams]);

  return (
    <>
      <Link href="/admin" className="mb-2 inline-block text-sm text-emerald-700 underline">
        ← Volver
      </Link>
      <Titulo sub="Avisos a los administradores de los clubes y mensajes enviados por la plataforma">Avisos</Titulo>
      <Aviso {...leerAviso(msg)} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Avisar a los admins de club">
          <form action={enviarAvisoPlataformaAction} className="flex flex-col gap-3">
            <Campo label="Asunto" name="asunto" required />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Mensaje</span>
              <textarea name="mensaje" rows={4} required className="rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <Selector label="Para" name="clubId" defaultValue="">
              <option value="">Todos los clubes</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Selector>
            <Boton type="submit">Enviar</Boton>
          </form>
        </Card>
        <div className="lg:col-span-2">
          <Card title="Buzón de salida (todos los clubes)">
            <BuzonSalida mensajes={buzon} conClub />
          </Card>
        </div>
      </div>
    </>
  );
}
