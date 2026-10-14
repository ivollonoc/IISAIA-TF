// Herramientas de la skill club-branding. Uso (desde la raíz del repo):
//   npx tsx .claude/skills/club-branding/scripts/paleta.ts extraer <logo>
//   npx tsx .claude/skills/club-branding/scripts/paleta.ts tema --primario #rrggbb [--secundario #rrggbb]
//        [--logo <logo>] [--salida tema.json] [--preview preview.html] [--ajustar]
// `extraer` lista los colores dominantes del logo. `tema` arma la escala 50–950 en OKLCH,
// elige el color de texto, valida contraste con la misma regla que la app (src/lib/tema.ts)
// y genera una lámina HTML para revisar.
import { readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import sharp from "sharp";
import { PASOS, contraste, parseTema, temaSchema, type Tema } from "../../../../src/lib/tema";

// ---------- color: sRGB <-> OKLab/OKLCH (Björn Ottosson) ----------
type RGB = [number, number, number]; // 0..255
type Lab = [number, number, number];

const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklab([r, g, b]: RGB): Lab {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Devuelve sRGB sin recortar (puede salir de 0..255 si el color está fuera de gamut). */
function oklabToRgbRaw([L, a, b]: Lab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const enGamut = (c: RGB) => c.every((v) => v >= -0.5 && v <= 255.5);
const hex = (c: RGB) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
const deHex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const distancia = (x: Lab, y: Lab) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);

/** Color OKLCH -> hex, bajando el croma hasta que entre en sRGB. */
function lch(L: number, C: number, H: number): string {
  let lo = 0, hi = C;
  const at = (c: number) => oklabToRgbRaw([L, c * Math.cos(H), c * Math.sin(H)]);
  if (enGamut(at(C))) return hex(at(C));
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (enGamut(at(mid))) lo = mid; else hi = mid;
  }
  return hex(at(lo));
}

// ---------- extraer ----------
async function extraer(archivo: string) {
  const { data, info } = await sharp(archivo)
    .resize(120, 120, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 1) Cubetas de 4 bits por canal con el promedio real de cada una.
  const cubetas = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // transparente
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const c = cubetas.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++; c.r += r; c.g += g; c.b += b;
    cubetas.set(k, c);
    total++;
  }
  if (total === 0) throw new Error("La imagen es completamente transparente");

  // 2) Fusión greedy en OKLab: colores perceptualmente cercanos se juntan (absorbe el antialiasing).
  const grupos: { n: number; lab: Lab }[] = [];
  for (const c of [...cubetas.values()].sort((x, y) => y.n - x.n)) {
    const lab = rgbToOklab([c.r / c.n, c.g / c.n, c.b / c.n]);
    const cerca = grupos.find((g) => distancia(g.lab, lab) < 0.09);
    if (cerca) {
      const n = cerca.n + c.n;
      cerca.lab = cerca.lab.map((v, j) => (v * cerca.n + lab[j] * c.n) / n) as Lab;
      cerca.n = n;
    } else grupos.push({ n: c.n, lab });
  }

  // 3) Color de fondo probable: el de las esquinas, si son opacas.
  const px = (x: number, y: number) => (y * info.width + x) * 4;
  const esquinas = [px(0, 0), px(info.width - 1, 0), px(0, info.height - 1), px(info.width - 1, info.height - 1)]
    .filter((i) => data[i + 3] >= 128)
    .map((i) => rgbToOklab([data[i], data[i + 1], data[i + 2]]));

  const colores = grupos
    .sort((x, y) => y.n - x.n)
    .map((g) => {
      const [L, a, b] = g.lab;
      const C = Math.hypot(a, b);
      const tipo = C < 0.035 ? (L > 0.93 ? "blanco" : L < 0.25 ? "negro" : "gris") : "color";
      const fondo = esquinas.length >= 3 && esquinas.filter((e) => distancia(e, g.lab) < 0.09).length >= 3;
      return { hex: hex(oklabToRgbRaw(g.lab)), porcentaje: +((100 * g.n) / total).toFixed(1), tipo, fondoProbable: fondo };
    })
    .filter((c) => c.porcentaje >= 1);

  console.log(JSON.stringify({ archivo, pixelesOpacos: total, colores }, null, 2));
}

// ---------- tema ----------
const LUZ: Record<(typeof PASOS)[number], number> = {
  "50": 0.975, "100": 0.94, "200": 0.885, "300": 0.81, "400": 0.72, "500": 0.63,
  "600": 0.55, "700": 0.48, "800": 0.41, "900": 0.35, "950": 0.26,
};
const CROMA: Record<(typeof PASOS)[number], number> = {
  "50": 0.25, "100": 0.4, "200": 0.6, "300": 0.8, "400": 0.95, "500": 1,
  "600": 1, "700": 0.95, "800": 0.85, "900": 0.75, "950": 0.6,
};
const TEXTO_OSCURO = "#111827";

function escalaDesde(base: string): Tema["escala"] {
  const [, a, b] = rgbToOklab(deHex(base));
  const C = Math.hypot(a, b); // un logo gris da una escala gris
  const H = Math.atan2(b, a);
  return Object.fromEntries(PASOS.map((p) => [p, lch(LUZ[p], C * CROMA[p], H)])) as Tema["escala"];
}

const mejorTexto = (fondo: string) =>
  contraste(fondo, "#ffffff") >= contraste(fondo, TEXTO_OSCURO) ? "#ffffff" : TEXTO_OSCURO;

function armarTema(primario: string, secundario: string | undefined, ajustar: boolean) {
  const escala = escalaDesde(primario);
  const avisos: string[] = [];
  let p = primario.toLowerCase();
  if (contraste(p, mejorTexto(p)) < 4.5) {
    const reemplazo = (["500", "600", "700"] as const).map((k) => escala[k]).find((c) => contraste(c, "#ffffff") >= 4.5)!;
    const msg = `${p} no logra contraste AA ni con texto blanco ni oscuro`;
    if (!ajustar) throw new Error(`${msg}. Probá con --ajustar (usaría ${reemplazo}) o elegí otro primario.`);
    avisos.push(`${msg}: se usa ${reemplazo} como primario (mismo tono, más oscuro).`);
    p = reemplazo;
  }
  const tema: Tema = { primario: p, sobrePrimario: mejorTexto(p), escala, ...(secundario ? { secundario: secundario.toLowerCase() } : {}) };
  const r = temaSchema.safeParse(tema);
  if (!r.success) throw new Error("Tema inválido: " + r.error.issues.map((i) => i.message).join("; "));
  return { tema: r.data, avisos };
}

function dataUri(archivo: string) {
  const mime: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
  return `data:${mime[extname(archivo).toLowerCase()] ?? "image/png"};base64,${readFileSync(archivo).toString("base64")}`;
}

function lamina(tema: Tema, logo?: string) {
  const sec = tema.secundario ?? tema.primario;
  const fila = (c: string, label: string) => {
    const t = mejorTexto(c);
    return `<div class="sw" style="background:${c};color:${t}"><b>${label}</b><span>${c}</span><small>${contraste(c, t).toFixed(1)}:1</small></div>`;
  };
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>Tema del club</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#f8fafc;color:#1e293b}
.wrap{max-width:900px;margin:0 auto;padding:24px}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin:28px 0 10px}
.esc{display:grid;grid-template-columns:repeat(11,1fr);border-radius:12px;overflow:hidden}
.sw{padding:14px 6px;display:flex;flex-direction:column;gap:2px;font-size:11px;min-height:70px}
.base{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.base .sw{border-radius:12px;font-size:14px}
header{background:#fff;border-bottom:4px solid ${sec};display:flex;align-items:center;gap:10px;padding:12px 16px;font-weight:700;color:${tema.escala["800"]};border-radius:12px 12px 0 0}
header img{height:32px;width:32px;object-fit:contain}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;padding:20px}
.btn{background:${tema.primario};color:${tema.sobrePrimario};border:0;border-radius:8px;padding:8px 16px;font-weight:600}
a{color:${tema.escala["700"]}}.tag{color:${tema.escala["700"]};font-size:13px;font-weight:600;text-transform:uppercase}
input{border:1px solid ${tema.escala["600"]};border-radius:8px;padding:8px}
@media(max-width:600px){.esc{grid-template-columns:repeat(4,1fr)}}
</style>
<div class="wrap">
${logo ? `<img src="${dataUri(logo)}" alt="logo" style="height:96px">` : ""}
<h2>Base</h2><div class="base">${fila(tema.primario, "primario")}${fila(sec, "secundario")}</div>
<h2>Escala</h2><div class="esc">${PASOS.map((p) => fila(tema.escala[p], p)).join("")}</div>
<h2>Vista previa</h2>
<header>${logo ? `<img src="${dataUri(logo)}" alt="">` : ""}Club</header>
<div class="card"><p class="tag">Panel del club</p><p>Socio <a href="#">Lucía Gómez</a> · cuota al día</p>
<p><input placeholder="Buscar socio"> <button class="btn">Registrar pago</button></p></div>
</div></html>`;
}

// ---------- CLI ----------
function flag(args: string[], nombre: string) {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "extraer" && args[0]) return extraer(args[0]);
  if (cmd === "tema") {
    const primario = flag(args, "primario");
    if (!primario || !/^#[0-9a-fA-F]{6}$/.test(primario)) throw new Error("Falta --primario #rrggbb");
    const secundario = flag(args, "secundario");
    const { tema, avisos } = armarTema(primario, secundario, args.includes("--ajustar"));
    const salida = flag(args, "salida");
    const preview = flag(args, "preview");
    if (salida) writeFileSync(salida, JSON.stringify(tema, null, 2) + "\n");
    if (preview) writeFileSync(preview, lamina(tema, flag(args, "logo")));
    console.log(JSON.stringify({ tema, avisos, validoParaLaApp: parseTema(tema) !== null }, null, 2));
    return;
  }
  console.error("Uso: paleta.ts extraer <logo> | paleta.ts tema --primario #rrggbb [--secundario #rrggbb] [--logo f] [--salida f] [--preview f] [--ajustar]");
  process.exit(2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
