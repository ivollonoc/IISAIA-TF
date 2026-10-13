"use client";

// Login en la página principal: un campo de email (link mágico por mail) y, en modo demo,
// botones para entrar directo con cada rol.
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useActionState } from "react";
import { Boton, Campo } from "@/components/ui";
import { solicitarLinkAction, type EstadoLink } from "../actions";

const DEMOS = [
  { email: "admin@gestiondesocios.com", rol: "Admin general" },
  { email: "admin@demo.club", rol: "Admin del club" },
  { email: "socio@demo.club", rol: "Socio" },
];

export function LoginHome({ demo, error }: { demo: boolean; error?: string }) {
  const [estado, pedirLink, enviando] = useActionState<EstadoLink, FormData>(solicitarLinkAction, { enviado: false });

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {estado.enviado ? (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-medium">Revisá tu correo.</p>
          <p>Si el email está registrado, te mandamos un link para entrar (vale 15 minutos).</p>
          {estado.linkDemo && (
            <p className="mt-2">
              Modo demo (mails simulados):{" "}
              <Link href={estado.linkDemo} className="font-medium underline">
                abrir el link
              </Link>
            </p>
          )}
        </div>
      ) : (
        <form action={pedirLink} className="flex flex-col gap-3">
          <Campo label="Tu email" name="email" type="email" placeholder="nombre@ejemplo.com" required autoComplete="email" />
          {estado.error && <p className="text-sm text-red-700">{estado.error}</p>}
          <Boton type="submit" disabled={enviando}>
            {enviando ? "Enviando…" : "Recibir link para entrar"}
          </Boton>
          <p className="text-xs text-slate-500">Sin contraseña: te mandamos un link de un solo uso a tu correo.</p>
        </form>
      )}

      {demo && (
        <div className="border-t border-slate-100 pt-4">
          <p className="mb-2 text-sm font-medium text-slate-700">Probar la demo como</p>
          <div className="flex flex-wrap gap-2">
            {DEMOS.map((d) => (
              <Boton key={d.email} type="button" variante="secundario" onClick={() => signIn("demo", { email: d.email, callbackUrl: "/" })}>
                {d.rol}
              </Boton>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
