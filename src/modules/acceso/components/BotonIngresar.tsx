"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Boton } from "@/components/ui";

/** Entra con el token del link (NextAuth, provider "link"); si no sirve, vuelve al home con el error. */
export function BotonIngresar({ token }: { token: string }) {
  const [entrando, setEntrando] = useState(false);
  return (
    <Boton
      className="w-full"
      disabled={entrando}
      onClick={() => {
        setEntrando(true);
        void signIn("link", { token, callbackUrl: "/" });
      }}
    >
      {entrando ? "Entrando…" : "Ingresar"}
    </Boton>
  );
}
