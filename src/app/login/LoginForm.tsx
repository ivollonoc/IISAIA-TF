"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Boton, Campo } from "@/components/ui";

const DEMO_USERS = ["admin@gestiondesocios.com", "admin@demo.club", "socio@demo.club"];

export function LoginForm({ google, demo }: { google: boolean; demo: boolean }) {
  const [email, setEmail] = useState("");

  return (
    <div className="flex flex-col gap-6">
      {google && (
        <Boton variante="secundario" onClick={() => signIn("google", { callbackUrl: "/" })}>
          Continuar con Google
        </Boton>
      )}

      {demo && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            signIn("demo", { email, callbackUrl: "/" });
          }}
        >
          <p className="text-sm text-slate-500">Modo demo: ingresá con un email registrado, sin contraseña.</p>
          <Campo label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Boton type="submit">Ingresar (demo)</Boton>
          <div className="flex flex-wrap gap-2">
            {DEMO_USERS.map((u) => (
              <button key={u} type="button" onClick={() => setEmail(u)} className="text-xs text-emerald-700 underline">
                {u}
              </button>
            ))}
          </div>
        </form>
      )}

      {!google && !demo && <p className="text-sm text-red-700">No hay métodos de login configurados (ver .env).</p>}
    </div>
  );
}
