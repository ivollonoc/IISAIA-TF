import { apiClub, json, manejar } from "@/lib/api";
import { cancelarInscripcion, inscribir } from "@/server/actividades";

type Ctx = { params: Promise<{ slug: string; id: string }> };

/** POST /api/clubs/:slug/actividades/:id/inscripcion — el socio logueado se inscribe. */
export async function POST(_req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  const r = await apiClub(slug, ["socio"]);
  if ("error" in r) return r.error;
  return manejar(async () => json(await inscribir(r.club.id, id, r.user.socioId!), 201));
}

/** DELETE /api/clubs/:slug/actividades/:id/inscripcion — cancela su inscripción. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  const r = await apiClub(slug, ["socio"]);
  if ("error" in r) return r.error;
  return manejar(async () => {
    await cancelarInscripcion(r.club.id, id, r.user.socioId!);
    return new Response(null, { status: 204 });
  });
}
