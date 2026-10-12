import type { Pasarela } from "./pasarela";

/** Tarjetas de prueba que se muestran en el checkout. */
export const TARJETAS_DE_PRUEBA = [
  { numero: "4000 0000 0000 0001", resultado: "Aprobada" },
  { numero: "4000 0000 0000 0002", resultado: "Rechazada (fondos insuficientes)" },
] as const;

/** Pasarela de demo: la tarjeta terminada en 0002 se rechaza; cualquier otra se aprueba. */
export const pasarelaSimulada: Pasarela = {
  nombre: "simulada",
  async cobrar(cobro, tarjeta) {
    if (tarjeta.numero.endsWith("0002")) return { estado: "RECHAZADO", motivo: "Fondos insuficientes" };
    return { estado: "APROBADO", referencia: `SIM-${cobro.intentoId}` };
  },
};
