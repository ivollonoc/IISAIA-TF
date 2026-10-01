// Configuración de NextAuth: sesión JWT con rol y club como claims.
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "./db";
import type { Rol } from "./permisos";

export const googleHabilitado = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const demoHabilitado = process.env.DEMO_LOGIN === "true";

const providers: NextAuthOptions["providers"] = [];

if (googleHabilitado) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  );
}

if (demoHabilitado) {
  // Login sin contraseña para demos: solo acepta emails ya registrados.
  providers.push(
    CredentialsProvider({
      id: "demo",
      name: "Demo",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        if (!email) return null;
        const u = await db.usuario.findUnique({ where: { email } });
        return u ? { id: u.id, email: u.email, name: u.nombre } : null;
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // Solo entran emails dados de alta por un admin (o el SUPERADMIN configurado).
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      if (email === process.env.SUPERADMIN_EMAIL?.toLowerCase()) {
        await db.usuario.upsert({
          where: { email },
          update: { rol: "SUPERADMIN", clubId: null },
          create: { email, nombre: user.name, rol: "SUPERADMIN" },
        });
        return true;
      }
      return (await db.usuario.count({ where: { email } })) > 0;
    },

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
