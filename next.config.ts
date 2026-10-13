import type { NextConfig } from "next";

// Con subdominios por club (TENANT_MODE=subdomain), los Server Actions llegan desde
// <club>.<ROOT_DOMAIN>: hay que permitir ese origen y el del dominio raíz.
const root = process.env.ROOT_DOMAIN;
const subdominios = process.env.TENANT_MODE === "subdomain" && root ? [root, `*.${root}`] : [];

const nextConfig: NextConfig = {
  // Los componentes cliente también arman links del club (urlClub en src/lib/tenant.ts).
  env: { TENANT_MODE: process.env.TENANT_MODE ?? "", ROOT_DOMAIN: root ?? "" },
  experimental: {
    // Codespaces sirve la app detrás de un proxy (*.app.github.dev);
    // sin esto Next rechaza los Server Actions por origen distinto.
    serverActions: { allowedOrigins: ["localhost:3000", "*.app.github.dev", ...subdominios] },
  },
};

export default nextConfig;
