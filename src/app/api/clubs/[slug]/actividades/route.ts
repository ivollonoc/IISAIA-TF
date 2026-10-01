import { apiClub, json } from "@/lib/api";
import { listarActividades } from "@/server/actividades";

/** GET /api/clubs/:slug/actividades — actividades con cantidad de inscriptos (admin o socio). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const r = await apiClub((await params).slug, ["admin", "socio"]);
  if ("error" in r) return r.error;
  return json(await listarActividades(r.club.id));
}
