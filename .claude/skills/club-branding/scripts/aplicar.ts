// Guarda el tema y el logo en un club. Uso (desde la raíz del repo, con DATABASE_URL de la base local):
//   DATABASE_URL=… npx tsx .claude/skills/club-branding/scripts/aplicar.ts <slug> <tema.json> <logo> [--produccion]
// Copia el logo a public/clubs/<slug>.<ext> y actualiza Club.logoUrl y Club.tema.
// Si DATABASE_URL no apunta a una base local, exige --produccion (lo pide la skill tras confirmar con el usuario).
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { temaSchema } from "../../../../src/lib/tema";

async function main() {
  const [slug, temaPath, logo] = process.argv.slice(2);
  if (!slug || !temaPath || !logo) throw new Error("Uso: aplicar.ts <slug> <tema.json> <logo> [--produccion]");

  const url = process.env.DATABASE_URL ?? "";
  const local = /@(localhost|127\.0\.0\.1|db)[:/]/.test(url);
  if (!local && !process.argv.includes("--produccion")) {
    throw new Error("DATABASE_URL no es local. Confirmá con el usuario y repetí con --produccion.");
  }

  const tema = temaSchema.parse(JSON.parse(readFileSync(temaPath, "utf8")));
  const ext = extname(logo).toLowerCase();
  if (![".svg", ".png", ".jpg", ".jpeg", ".webp"].includes(ext)) throw new Error(`Formato de logo no soportado: ${ext}`);

  const prisma = new PrismaClient();
  try {
    const club = await prisma.club.findUnique({ where: { slug } });
    if (!club) throw new Error(`No existe el club "${slug}"`);

    mkdirSync("public/clubs", { recursive: true });
    const logoUrl = `/clubs/${slug}${ext}`;
    if (resolve(logo) !== resolve(`public${logoUrl}`)) copyFileSync(logo, `public${logoUrl}`);
    await prisma.club.update({ where: { slug }, data: { logoUrl, tema } });
    console.log(`OK: ${club.nombre} → logo ${logoUrl}, primario ${tema.primario}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
