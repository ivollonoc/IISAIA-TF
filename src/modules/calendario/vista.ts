// Estado de la vista de la Agenda en la URL (?vista=semana|mes|lista&semana=AAAA-MM-DD&mes=AAAA-MM).
import { claveDia, lunesDeParam, mesDeParam } from "./reglas";

export const VISTAS = ["semana", "mes", "lista"] as const;
export type Vista = (typeof VISTAS)[number];
export interface VistaAgenda {
  vista: Vista;
  semana: string; // lunes, AAAA-MM-DD
  mes: string; // AAAA-MM
}

export function vistaDeParams(sp: { vista?: string; semana?: string; mes?: string }, hoy: Date = new Date()): VistaAgenda {
  const vista = VISTAS.find((v) => v === sp.vista) ?? "semana";
  const semana = claveDia(lunesDeParam(sp.semana, hoy));
  const mes = sp.mes ? mesDeParam(sp.mes, hoy) : semana.slice(0, 7);
  return { vista, semana, mes };
}

export function hrefAgenda(base: string, v: VistaAgenda, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ vista: v.vista, semana: v.semana, mes: v.mes, ...extra });
  return `${base}?${q.toString()}`;
}

/** Ruta de la Agenda del admin en la vista `volver` (saneada), con una selección opcional ("clase=…"). */
export function rutaAgenda(slug: string, volver: string, seleccion?: Record<string, string>): string {
  const q = new URLSearchParams(queryVista(volver));
  for (const [k, v] of Object.entries(seleccion ?? {})) q.set(k, v);
  const s = q.toString();
  return `/c/${slug}/admin/agenda${s ? `?${s}` : ""}`;
}

/** Ruta de la Agenda del socio en la vista `volver` (saneada). */
export function rutaAgendaSocio(slug: string, volver: string): string {
  return `/c/${slug}/socio/agenda${queryVista(volver)}`;
}

const VALIDOS: Record<string, RegExp> = {
  vista: /^(semana|mes|lista)$/,
  semana: /^\d{4}-\d{2}-\d{2}$/,
  mes: /^\d{4}-\d{2}$/,
};

/**
 * Query de la vista que llega desde un formulario (argumento de un Server Action, manipulable):
 * solo pasan vista, semana y mes con formato válido. Devuelve "" o "?…".
 */
export function queryVista(volver: string): string {
  const entrada = new URLSearchParams(volver);
  const salida = new URLSearchParams();
  for (const [clave, patron] of Object.entries(VALIDOS)) {
    const valor = entrada.get(clave);
    if (valor && patron.test(valor)) salida.set(clave, valor);
  }
  const q = salida.toString();
  return q ? `?${q}` : "";
}
