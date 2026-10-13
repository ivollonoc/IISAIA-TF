import type { NextConfig } from "next";

// Con subdominios por club (TENANT_MODE=subdomain), los Server Actions llegan desde
// <club>.<ROOT_DOMAIN>: hay que permitir ese origen y el del dominio raíz.
const root = process.env.ROOT_DOMAIN;
const subdominios = process.env.TENANT_MODE === "subdomain" && root ? [root, `*.${root}`] : [];

const nextConfig: NextConfig = {
  experimental: {
    // Codespaces sirve la app detrás de un proxy (*.app.github.dev);
    // sin esto Next rechaza los Server Actions por origen distinto.
    serverActions: { allowedOrigins: ["localhost:3000", "*.app.github.dev", ...subdominios] },
  },
};

export default nextConfig;
