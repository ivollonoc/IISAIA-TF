// Tema visual por club: paleta guardada en Club.tema (JSON) y aplicada como
// variables CSS --club-* que consume Tailwind (ver globals.css).
// Lo genera la skill .claude/skills/club-branding a partir del logo.
import { z } from "zod";

export const PASOS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color con formato #rrggbb").toLowerCase();

export const temaSchema = z
  .object({
    primario: hex,
    sobrePrimario: hex, // color de texto sobre el primario
    secundario: hex.optional(),
    escala: z.object(Object.fromEntries(PASOS.map((p) => [p, hex])) as Record<(typeof PASOS)[number], typeof hex>),
  })
  .refine((t) => contraste(t.primario, t.sobrePrimario) >= 4.5, "El texto sobre el primario no llega a contraste AA")
  .refine((t) => contraste(t.escala["700"], "#ffffff") >= 4.5, "El tono 700 no se lee sobre blanco");

export type Tema = z.infer<typeof temaSchema>;

/** Devuelve el tema si es válido y legible; si no, null (se usa el tema por defecto). */
export function parseTema(json: unknown): Tema | null {
  const r = temaSchema.safeParse(json);
  return r.success ? r.data : null;
}

/** Variables CSS para un `style` de React. */
export function temaCssVars(tema: Tema): Record<string, string> {
  const vars: Record<string, string> = {
    "--club-primario": tema.primario,
    "--club-sobre-primario": tema.sobrePrimario,
    "--club-secundario": tema.secundario ?? tema.primario,
  };
  for (const p of PASOS) vars[`--club-${p}`] = tema.escala[p];
  return vars;
}

function luminancia(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG 2 entre dos colores #rrggbb (1 a 21). */
export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
