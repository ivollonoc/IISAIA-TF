"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button onClick={() => signOut({ callbackUrl: "/" })} className="text-sm text-slate-600 hover:text-slate-900">
      Salir
    </button>
  );
}
