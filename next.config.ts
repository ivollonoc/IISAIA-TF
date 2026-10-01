import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Codespaces sirve la app detrás de un proxy (*.app.github.dev);
    // sin esto Next rechaza los Server Actions por origen distinto.
    serverActions: { allowedOrigins: ["localhost:3000", "*.app.github.dev"] },
  },
};

export default nextConfig;
