import { pasarelaMercadoPago } from "./mercadopago";
import type { Pasarela } from "./pasarela";
import { pasarelaSimulada } from "./simulada";

/** Pasarela configurada con la variable de entorno PASARELA ("simulada" por defecto). */
export function getPasarela(nombre: string = process.env.PASARELA || "simulada"): Pasarela {
  if (nombre === "simulada") return pasarelaSimulada;
  if (nombre === "mercadopago") return pasarelaMercadoPago;
  throw new Error(`Pasarela desconocida: ${nombre}`);
}
