// Parser de CSV sin dependencias: separador "," o ";" (Excel en español), comillas con "" para
// escaparlas y saltos de línea dentro de comillas, BOM y CRLF. El encabezado se normaliza
// (minúsculas, sin acentos) para reconocer las columnas.

const normalizar = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function parsearCsv(texto: string): { encabezado: string[]; filas: string[][] } {
  const limpio = texto.replace(/^﻿/, "");
  const primeraLinea = limpio.split(/\r?\n/, 1)[0] ?? "";
  const separador = (primeraLinea.match(/;/g)?.length ?? 0) > (primeraLinea.match(/,/g)?.length ?? 0) ? ";" : ",";

  const registros: string[][] = [];
  let registro: string[] = [];
  let campo = "";
  let entreComillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === separador) {
      registro.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      registro.push(campo);
      registros.push(registro);
      registro = [];
      campo = "";
    } else campo += c;
  }
  registro.push(campo);
  registros.push(registro);

  const utiles = registros.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ""));
  if (utiles.length === 0) return { encabezado: [], filas: [] };
  const [encabezado, ...filas] = utiles;
  return { encabezado: encabezado.map(normalizar), filas };
}
