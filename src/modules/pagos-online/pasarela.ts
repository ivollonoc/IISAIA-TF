// Contrato de una pasarela de pago. La cuenta corriente no la conoce: solo la usa el checkout.

export interface Tarjeta {
  numero: string;
  vencimiento: string;
  cvv: string;
  titular: string;
}

export interface Cobro {
  intentoId: string;
  monto: number;
  descripcion: string;
}

/** PENDIENTE no ocurre con la simulada; queda para pasarelas asincrónicas como Mercado Pago. */
export type ResultadoPasarela =
  | { estado: "APROBADO"; referencia: string }
  | { estado: "RECHAZADO"; motivo: string }
  | { estado: "PENDIENTE"; referencia: string; redirectUrl?: string };

export interface Pasarela {
  nombre: string;
  cobrar(cobro: Cobro, tarjeta: Tarjeta): Promise<ResultadoPasarela>;
}
