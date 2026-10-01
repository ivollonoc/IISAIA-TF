import { json } from "@/lib/api";
import { getUsuario } from "@/lib/session";

/** GET /api/me — usuario de la sesión actual (rol y club). */
export async function GET() {
  const user = await getUsuario();
  return user ? json(user) : json({ error: "No autenticado" }, 401);
}
