import { apiClub, json, manejar } from "@/lib/api";
import { crearSocio, listarSocios } from "@/server/socios";

type Ctx = { params: Promise<{ slug: string }> };

/** GET /api/clubs/:slug/socios — padrón del club (admin). */
export async function GET(_req: Request, { params }: Ctx) {
  const r = await apiClub((await params).slug, ["admin"]);
  if ("error" in r) return r.error;
  return json(await listarSocios(r.club.id));
}

/** POST /api/clubs/:slug/socios — alta de socio (admin). */
export async function POST(req: Request, { params }: Ctx) {
  const r = await apiClub((await params).slug, ["admin"]);
  if ("error" in r) return r.error;
  const body = await req.json().catch(() => ({}));
  return manejar(async () => json(await crearSocio(r.club.id, body), 201));
}
