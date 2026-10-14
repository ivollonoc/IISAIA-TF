import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { BannerAvisos } from "@/components/BannerAvisos";
import { Header } from "@/components/Header";
import { temaCssVars } from "@/lib/tema";
import { clubDelPedido } from "@/modules/clubs/visual";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestión de Socios",
  description: "Administración de socios, cuotas y actividades para clubes deportivos",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Con los colores del club del subdominio o del usuario; sin club, el esmeralda de globals.css.
  const club = await clubDelPedido();
  const style = club?.tema ? (temaCssVars(club.tema) as CSSProperties) : undefined;

  return (
    <html lang="es">
      <body style={style}>
        <Header />
        <BannerAvisos />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
