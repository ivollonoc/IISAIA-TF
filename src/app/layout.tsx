import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BannerAvisos } from "@/components/BannerAvisos";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestión de Socios",
  description: "Administración de socios, cuotas y actividades para clubes deportivos",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Header />
        <BannerAvisos />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
