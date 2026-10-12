import type { Pasarela } from "./pasarela";

/**
 * Esqueleto para integrar Mercado Pago (Checkout Pro). Pendiente:
 * - Credenciales: MP_ACCESS_TOKEN como variable de entorno.
 * - cobrar(): crear una "preference" con el monto y la descripción, usando cobro.intentoId como
 *   external_reference, y devolver { estado: "PENDIENTE", referencia: preference.id, redirectUrl: init_point }.
 *   La tarjeta la carga el usuario en Mercado Pago: nunca pasa por nuestro servidor.
 * - Webhook (p. ej. POST /api/pagos/mercadopago/webhook): validar la firma, consultar el pago,
 *   buscar el IntentoPago por external_reference y, si quedó aprobado, llamar a registrarPago
 *   (medio ONLINE) y vincular el pago al intento. Debe ser idempotente: MP reintenta notificaciones.
 */
export const pasarelaMercadoPago: Pasarela = {
  nombre: "mercadopago",
  async cobrar() {
    throw new Error("Pasarela Mercado Pago no implementada");
  },
};
