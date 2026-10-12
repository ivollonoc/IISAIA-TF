// Validación de los datos de tarjeta del checkout. Nunca se persisten número ni CVV.
import { z } from "zod";
import { texto } from "@/lib/validation";

/** ¿La tarjeta con vencimiento "MM/AA" sigue vigente en `hoy`? Vale hasta el último día de ese mes. */
export function tarjetaVigente(vencimiento: string, hoy: Date = new Date()): boolean {
  const [mes, anio] = vencimiento.split("/").map(Number);
  return new Date(2000 + anio, mes, 1) > hoy;
}

export const tarjetaSchema = z.object({
  numero: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\d{16}$/, "Número de tarjeta: 16 dígitos")),
  vencimiento: z
    .string()
    .trim()
    .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Vencimiento con formato MM/AA")
    .refine((v) => tarjetaVigente(v), "La tarjeta está vencida"),
  cvv: z.string().trim().regex(/^\d{3,4}$/, "CVV: 3 o 4 dígitos"),
  titular: texto(60),
});

/** Ids de cargos del parámetro ?cargos del checkout: acepta parámetros repetidos y separados por coma. */
export function parsearCargos(param: string | string[] | undefined): string[] {
  return ([] as string[])
    .concat(param ?? [])
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}
