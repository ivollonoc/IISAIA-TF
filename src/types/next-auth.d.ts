import type { DefaultSession } from "next-auth";
import type { Rol } from "@/lib/permisos";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      email: string;
      rol: Rol;
      clubId: string | null;
      clubSlug: string | null;
      socioId: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    rol: Rol;
    clubId: string | null;
    clubSlug: string | null;
    socioId: string | null;
  }
}
