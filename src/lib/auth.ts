// Configuración de NextAuth: sesión JWT con rol y club como claims. Se entra sin contraseña:
// los usuarios demo directamente (solo con DEMO_LOGIN) y el resto con un link mágico por mail.
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { autorizarDemo, autorizarLink } from "@/modules/acceso/service";
import { db } from "./db";
import type { Rol } from "./permisos";

export const demoHabilitado = process.env.DEMO_LOGIN === "true";

const providers: NextAuthOptions["providers"] = [
  // Link mágico o invitación: el token del link es la credencial (un solo uso).
  CredentialsProvider({
    id: "link",
    name: "Link",
    credentials: { token: { label: "Token", type: "text" } },
    authorize: (credentials) => (credentials?.token ? autorizarLink(credentials.token) : null),
  }),
];

if (demoHabilitado) {
  // Login sin contraseña para demos: solo usuarios marcados como demo.
  providers.push(
    CredentialsProvider({
      id: "demo",
      name: "Demo",
      credentials: { email: { label: "Email", type: "email" } },
      authorize: (credentials) => (credentials?.email ? autorizarDemo(credentials.email) : null),
    }),
  );
}

// Con subdominios por club, la cookie de sesión vale para el dominio y todos sus subdominios
// (en localhost los navegadores no aceptan cookies de dominio: cada subdominio tiene la suya).
const root = process.env.ROOT_DOMAIN?.split(":")[0];
const dominioCookie = process.env.TENANT_MODE === "subdomain" && root && root !== "localhost" ? `.${root}` : undefined;

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt" },
  ...(dominioCookie && {
    cookies: {
      sessionToken: {
        name: "__Secure-next-auth.session-token",
        options: { httpOnly: true, sameSite: "lax", path: "/", secure: true, domain: dominioCookie },
      },
    },
  }),
  pages: { signIn: "/", error: "/" },
  callbacks: {
    // En el primer login cargamos rol/club desde la base y quedan en el token.
    async jwt({ token, user }) {
      if (user?.email) {
        const u = await db.usuario.findUnique({
          where: { email: user.email.toLowerCase() },
          include: { club: true, socio: true },
        });
        if (u) {
          token.uid = u.id;
          token.rol = u.rol as Rol;
          token.clubId = u.clubId;
          token.clubSlug = u.club?.slug ?? null;
          token.socioId = u.socio?.id ?? null;
        }
      }
      return token;
    },

    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.uid,
        email: token.email ?? "",
        rol: token.rol,
        clubId: token.clubId,
        clubSlug: token.clubSlug,
        socioId: token.socioId,
      };
      return session;
    },
  },
};
