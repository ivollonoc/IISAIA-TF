# Etapa 1 — Cuenta corriente y pago simulado: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el socio vea qué debe y lo pague con un checkout simulado, y que el pago se refleje al instante en su estado, en la cuenta del club y en la vista del admin general.

**Architecture:** Dos módulos nuevos. `src/modules/cuenta-corriente` contiene las reglas puras, los cargos, los pagos (la única vía para cancelar cargos), las consultas, las actions y los componentes. `src/modules/pagos-online` contiene la interfaz `Pasarela`, la pasarela simulada, el esqueleto de Mercado Pago y el checkout. El modelo agrega `Cargo` e `IntentoPago`, y `Pago` deja de ser "un pago por período" para pasar a cancelar N cargos. La cuenta del club se deriva de los pagos.

**Tech Stack:** Next.js 15 (App Router, Server Actions) · React 19 · TypeScript · Prisma 6.19 · PostgreSQL 16 · Zod 3 · Vitest 3.2 · Node 22.

**Spec:** `docs/superpowers/specs/2026-10-12-etapa-1-cuenta-corriente-design.md` (roadmap: `docs/superpowers/specs/2026-10-12-roadmap-v2-design.md`). Se construye sobre la etapa 0 ya implementada en la rama `mvp2`.

## Global Constraints

- Rama `mvp2`. Commits locales, **sin push** (lo indica la persona). Mensajes en español, tercera persona ("Agrega…"), terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Node 22: anteponer `source ~/.nvm/nvm.sh >/dev/null && nvm use 22 >/dev/null &&` a cada comando npm/npx.
- Sin dependencias npm nuevas.
- Dinero en pesos enteros (`Int`).
- Servicios: `clubId` como primer parámetro y filtro en toda consulta.
- Estética: componentes de `src/components/ui.tsx` y paleta actual (esmeralda/slate; ámbar/rojo solo para estados). Único componente visual nuevo: `EstadoCargo`.
- Vencimientos: se guardan como **medianoche UTC** del día calendario y se muestran con `formatDia` (zona UTC). Las fechas de movimientos (`createdAt`, `Pago.fecha`) se muestran con `formatFecha`.
- `diaVencimiento` ∈ 1..28 (default 10). Tarjetas de prueba: terminada en `0002` → rechazada ("Fondos insuficientes"); cualquier otra válida → aprobada. **Nunca** se persisten número completo ni CVV (solo `ultimos4`).
- `PASARELA=simulada|mercadopago` (default `simulada`).
- Migraciones: el agente **no** ejecuta `prisma migrate reset` ni `migrate dev`. La migración nueva se genera con `prisma migrate diff --from-schema-datasource` contra la base local de desarrollo (que está en `0_init`) y se aplica con `npm run db:deploy`.
- Un servidor `npm run dev` puede estar corriendo en segundo plano desde la sesión anterior. Detenerlo antes de la Task 3 (cambio de esquema) y volver a levantarlo en la Task 8.

## Review Focus

1. **Vencimientos mostrados un día antes.** La medianoche UTC renderizada en UTC-3 cae en el día anterior. Se espera que el socio vea "vence el 10/10/2026" cuando el cargo vence el 10. → test `formatDia` en Task 3.
2. **Socio que edita la URL del checkout** con cargos de otro socio o ya pagados. Se espera un error claro, sin crear intento ni cobrar. → tests de `prepararCheckout` y `pagarOnline` en Task 6.
3. **Checkout sin cargos** (`/socio/pagar` sin `?cargos`). Se espera "Elegí al menos un cargo", no un 500. → test en Task 6.
4. **Socio con cuota $0** (tipo gratuito) que se inscribe a una actividad paga cuando el período ya se generó. Se espera que reciba el cargo del arancel. → test en Task 5. Ver Ruling de la Task 5.
5. **Socio dado de baja con deuda vencida.** No cuenta como moroso (no es activo), pero su deuda sí suma en "Deuda vencida". → test en Task 3.

---

### Task 1: Reglas puras de cuenta corriente

**Files:**
- Create: `src/modules/cuenta-corriente/reglas.ts`
- Test: `tests/unit/reglas.test.ts`

**Interfaces:**
- Produces (usadas por Tasks 3–7 y el seed):
  - `inicioDelDia(fecha?: Date): Date`: medianoche UTC del día calendario local.
  - `vencimiento(periodo: string, dia: number): Date`: lanza un error si el período es inválido o el día está fuera de 1..28.
  - `periodoSiguiente(periodo: string): string`
  - `periodosGenerables(hoy?: Date): [string, string]`: período actual y siguiente.
  - `rangoDelMes(periodo: string): { desde: Date; hasta: Date }` (hora local, `hasta` exclusivo)
  - `estaVencido(c: { estado: EstadoCargoStr; vencimiento: Date }, hoy?: Date): boolean`
  - `estaAlDia(cargos: { estado; vencimiento }[], hoy?: Date): boolean`
  - `interface Movimiento { id; fecha: Date; tipo: "CARGO" | "PAGO"; concepto; monto: number; anulado: boolean }`
  - `saldoAcumulado<T extends Movimiento>(movs: T[]): (T & { saldo: number })[]`

- [ ] **Step 1: Escribir los tests**

`tests/unit/reglas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  estaAlDia,
  estaVencido,
  inicioDelDia,
  periodoSiguiente,
  periodosGenerables,
  rangoDelMes,
  saldoAcumulado,
  vencimiento,
  type Movimiento,
} from "@/modules/cuenta-corriente/reglas";

const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const hoy = new Date(2026, 9, 15, 13, 0); // 15/10/2026 13:00, hora local

describe("vencimiento", () => {
  it("es el día indicado del mes del período, a medianoche UTC", () => {
    expect(vencimiento("2026-10", 10)).toEqual(utc(2026, 10, 10));
  });

  it("el día 28 existe en febrero", () => {
    expect(vencimiento("2027-02", 28)).toEqual(utc(2027, 2, 28));
  });

  it("diciembre queda en el mismo año", () => {
    expect(vencimiento("2026-12", 5)).toEqual(utc(2026, 12, 5));
  });

  it("rechaza días fuera de 1..28 y períodos inválidos", () => {
    expect(() => vencimiento("2026-10", 29)).toThrow();
    expect(() => vencimiento("2026-10", 0)).toThrow();
    expect(() => vencimiento("2026-13", 10)).toThrow();
  });
});

describe("períodos", () => {
  it("periodoSiguiente cruza el año", () => {
    expect(periodoSiguiente("2026-12")).toBe("2027-01");
    expect(periodoSiguiente("2026-09")).toBe("2026-10");
  });

  it("periodosGenerables devuelve el actual y el siguiente", () => {
    expect(periodosGenerables(new Date(2026, 11, 20))).toEqual(["2026-12", "2027-01"]);
  });

  it("rangoDelMes va del día 1 (inclusive) al 1 del mes siguiente (exclusive), en hora local", () => {
    expect(rangoDelMes("2026-12")).toEqual({ desde: new Date(2026, 11, 1), hasta: new Date(2027, 0, 1) });
  });
});

describe("estaVencido / estaAlDia", () => {
  const pendiente = (venc: Date) => ({ estado: "PENDIENTE" as const, vencimiento: venc });

  it("inicioDelDia toma el día calendario local", () => {
    expect(inicioDelDia(hoy)).toEqual(utc(2026, 10, 15));
  });

  it("sin cargos está al día", () => {
    expect(estaAlDia([], hoy)).toBe(true);
  });

  it("un pendiente que vence más adelante no lo hace moroso", () => {
    expect(estaAlDia([pendiente(utc(2026, 10, 20))], hoy)).toBe(true);
  });

  it("un pendiente que vence hoy todavía no está vencido", () => {
    expect(estaVencido(pendiente(utc(2026, 10, 15)), hoy)).toBe(false);
    expect(estaAlDia([pendiente(utc(2026, 10, 15))], hoy)).toBe(true);
  });

  it("un pendiente vencido lo hace moroso", () => {
    expect(estaAlDia([pendiente(utc(2026, 10, 14))], hoy)).toBe(false);
  });

  it("pagados y anulados no cuentan aunque estén vencidos", () => {
    expect(
      estaAlDia(
        [
          { estado: "PAGADO", vencimiento: utc(2026, 9, 10) },
          { estado: "ANULADO", vencimiento: utc(2026, 9, 10) },
        ],
        hoy,
      ),
    ).toBe(true);
  });
});

describe("saldoAcumulado", () => {
  it("ordena por fecha (el cargo antes que el pago el mismo día) y no suma anulados", () => {
    const m = (id: string, fecha: Date, tipo: "CARGO" | "PAGO", monto: number, anulado = false): Movimiento => ({
      id,
      fecha,
      tipo,
      concepto: id,
      monto,
      anulado,
    });
    const r = saldoAcumulado([
      m("p", new Date(2026, 9, 3), "PAGO", 60),
      m("c30", new Date(2026, 9, 3), "CARGO", 30),
      m("anul", new Date(2026, 9, 2), "CARGO", 50, true),
      m("c100", new Date(2026, 9, 1), "CARGO", 100),
    ]);
    expect(r.map((x) => [x.id, x.saldo])).toEqual([
      ["c100", 100],
      ["anul", 100],
      ["c30", 130],
      ["p", 70],
    ]);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run tests/unit/reglas.test.ts`
Expected: FAIL — `Cannot find module '@/modules/cuenta-corriente/reglas'` (o "Failed to resolve import").

- [ ] **Step 3: Implementar**

`src/modules/cuenta-corriente/reglas.ts`:

```ts
// Reglas puras de cuenta corriente (sin I/O) para poder testearlas aisladas.
import { PERIODO_REGEX, periodoActual } from "@/lib/periodo";

type EstadoCargoStr = "PENDIENTE" | "PAGADO" | "ANULADO";

/** Medianoche UTC del día calendario local de `fecha`: así se guardan y comparan los vencimientos. */
export function inicioDelDia(fecha: Date = new Date()): Date {
  return new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
}

/** Vencimiento de un período ("YYYY-MM") según el día de vencimiento del club (1..28). */
export function vencimiento(periodo: string, dia: number): Date {
  if (!PERIODO_REGEX.test(periodo)) throw new Error(`Período inválido: ${periodo}`);
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) throw new Error(`Día de vencimiento inválido: ${dia}`);
  const [anio, mes] = periodo.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia));
}

export function periodoSiguiente(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  return mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, "0")}`;
}

/** Períodos para los que se pueden generar cargos: el actual y el siguiente. */
export function periodosGenerables(hoy: Date = new Date()): [string, string] {
  const actual = periodoActual(hoy);
  return [actual, periodoSiguiente(actual)];
}

/** Rango de fechas (hora local) del mes de un período: [desde, hasta). */
export function rangoDelMes(periodo: string): { desde: Date; hasta: Date } {
  const [anio, mes] = periodo.split("-").map(Number);
  return { desde: new Date(anio, mes - 1, 1), hasta: new Date(anio, mes, 1) };
}

/** Un cargo pendiente está vencido si su vencimiento es anterior a hoy (el que vence hoy todavía no). */
export function estaVencido(cargo: { estado: EstadoCargoStr; vencimiento: Date }, hoy: Date = new Date()): boolean {
  return cargo.estado === "PENDIENTE" && cargo.vencimiento.getTime() < inicioDelDia(hoy).getTime();
}

/** Un socio está al día si no tiene cargos vencidos impagos. */
export function estaAlDia(cargos: { estado: EstadoCargoStr; vencimiento: Date }[], hoy: Date = new Date()): boolean {
  return !cargos.some((c) => estaVencido(c, hoy));
}

export interface Movimiento {
  id: string;
  fecha: Date;
  tipo: "CARGO" | "PAGO";
  concepto: string;
  monto: number;
  anulado: boolean;
}

/** Ordena por fecha (a igual fecha, el cargo antes que el pago) y agrega el saldo; los anulados no suman. */
export function saldoAcumulado<T extends Movimiento>(movs: T[]): (T & { saldo: number })[] {
  const orden = [...movs].sort(
    (a, b) => a.fecha.getTime() - b.fecha.getTime() || (a.tipo === b.tipo ? 0 : a.tipo === "CARGO" ? -1 : 1),
  );
  let saldo = 0;
  return orden.map((m) => {
    if (!m.anulado) saldo += m.tipo === "CARGO" ? m.monto : -m.monto;
    return { ...m, saldo };
  });
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run tests/unit/reglas.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/modules/cuenta-corriente/reglas.ts tests/unit/reglas.test.ts
git commit -m "Agrega reglas puras de cuenta corriente (vencimientos, al día, saldo)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pasarela de pago (interfaz, simulada, esqueleto de Mercado Pago) y validación de tarjeta

**Files:**
- Create: `src/modules/pagos-online/pasarela.ts`, `src/modules/pagos-online/simulada.ts`, `src/modules/pagos-online/mercadopago.ts`, `src/modules/pagos-online/index.ts`, `src/modules/pagos-online/schema.ts`
- Test: `tests/unit/pagos-online.test.ts`

**Interfaces:**
- Produces (Task 6):
  - `interface Tarjeta { numero: string; vencimiento: string; cvv: string; titular: string }`
  - `interface Cobro { intentoId: string; monto: number; descripcion: string }`
  - `type ResultadoPasarela = { estado: "APROBADO"; referencia: string } | { estado: "RECHAZADO"; motivo: string } | { estado: "PENDIENTE"; referencia: string; redirectUrl?: string }`
  - `interface Pasarela { nombre: string; cobrar(cobro: Cobro, tarjeta: Tarjeta): Promise<ResultadoPasarela> }`
  - `pasarelaSimulada: Pasarela`, `TARJETAS_DE_PRUEBA: readonly { numero: string; resultado: string }[]`
  - `pasarelaMercadoPago: Pasarela` (lanza "Pasarela Mercado Pago no implementada")
  - `getPasarela(nombre?: string): Pasarela`
  - `tarjetaSchema` (Zod; normaliza `numero` a 16 dígitos sin espacios), `tarjetaVigente(mmaa: string, hoy?: Date): boolean`

- [ ] **Step 1: Escribir los tests**

`tests/unit/pagos-online.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getPasarela } from "@/modules/pagos-online";
import { tarjetaSchema, tarjetaVigente } from "@/modules/pagos-online/schema";
import { pasarelaSimulada } from "@/modules/pagos-online/simulada";

const tarjeta = { numero: "4000000000000001", vencimiento: "12/30", cvv: "123", titular: "Lucía Gómez" };
const cobro = { intentoId: "int1", monto: 15000, descripcion: "Cuota social 2026-10" };

describe("pasarela simulada", () => {
  it("aprueba la tarjeta terminada en 0001", async () => {
    expect(await pasarelaSimulada.cobrar(cobro, tarjeta)).toEqual({ estado: "APROBADO", referencia: "SIM-int1" });
  });

  it("rechaza la tarjeta terminada en 0002 por fondos insuficientes", async () => {
    expect(await pasarelaSimulada.cobrar(cobro, { ...tarjeta, numero: "4000000000000002" })).toEqual({
      estado: "RECHAZADO",
      motivo: "Fondos insuficientes",
    });
  });

  it("aprueba cualquier otra tarjeta", async () => {
    const r = await pasarelaSimulada.cobrar(cobro, { ...tarjeta, numero: "5555444433331111" });
    expect(r.estado).toBe("APROBADO");
  });
});

describe("getPasarela", () => {
  it("devuelve la simulada por defecto y por nombre", () => {
    expect(getPasarela("simulada").nombre).toBe("simulada");
  });

  it("Mercado Pago está preparada pero no implementada", async () => {
    const mp = getPasarela("mercadopago");
    expect(mp.nombre).toBe("mercadopago");
    await expect(mp.cobrar(cobro, tarjeta)).rejects.toThrow("Pasarela Mercado Pago no implementada");
  });

  it("rechaza una pasarela desconocida", () => {
    expect(() => getPasarela("paypal")).toThrow("Pasarela desconocida: paypal");
  });
});

describe("tarjetaSchema", () => {
  it("normaliza el número quitando espacios y guiones", () => {
    const r = tarjetaSchema.parse({ ...tarjeta, numero: "4000 0000-0000 0001" });
    expect(r.numero).toBe("4000000000000001");
  });

  it("rechaza números que no tienen 16 dígitos", () => {
    expect(tarjetaSchema.safeParse({ ...tarjeta, numero: "400000000000001" }).success).toBe(false);
  });

  it("rechaza vencimientos mal formados o pasados", () => {
    expect(tarjetaSchema.safeParse({ ...tarjeta, vencimiento: "13/30" }).success).toBe(false);
    expect(tarjetaSchema.safeParse({ ...tarjeta, vencimiento: "01/20" }).success).toBe(false);
  });

  it("rechaza CVV de menos de 3 dígitos", () => {
    expect(tarjetaSchema.safeParse({ ...tarjeta, cvv: "12" }).success).toBe(false);
  });

  it("tarjetaVigente vale hasta el último día del mes de vencimiento", () => {
    expect(tarjetaVigente("10/26", new Date(2026, 9, 31, 23))).toBe(true);
    expect(tarjetaVigente("09/26", new Date(2026, 9, 1))).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run tests/unit/pagos-online.test.ts`
Expected: FAIL — no resuelve `@/modules/pagos-online`.

- [ ] **Step 3: Implementar**

`src/modules/pagos-online/pasarela.ts`:

```ts
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
```

`src/modules/pagos-online/simulada.ts`:

```ts
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
```

`src/modules/pagos-online/mercadopago.ts`:

```ts
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
```

`src/modules/pagos-online/index.ts`:

```ts
import { pasarelaMercadoPago } from "./mercadopago";
import type { Pasarela } from "./pasarela";
import { pasarelaSimulada } from "./simulada";

/** Pasarela configurada con la variable de entorno PASARELA ("simulada" por defecto). */
export function getPasarela(nombre: string = process.env.PASARELA || "simulada"): Pasarela {
  if (nombre === "simulada") return pasarelaSimulada;
  if (nombre === "mercadopago") return pasarelaMercadoPago;
  throw new Error(`Pasarela desconocida: ${nombre}`);
}
```

`src/modules/pagos-online/schema.ts`:

```ts
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
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run tests/unit/pagos-online.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/modules/pagos-online tests/unit/pagos-online.test.ts
git commit -m "Agrega la interfaz Pasarela con la simulada y el esqueleto de Mercado Pago

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Modelo de cargos y pagos, pago de cargos y cuenta del socio

Reemplaza el "pago por período" de la v1 por cargos y pagos que cancelan cargos. Incluye la migración, el seed de demo, `registrarPago`, las consultas por socio y las pantallas que mostraban pagos.

**Files:**
- Modify: `prisma/schema.prisma` (reemplazo completo)
- Create: `prisma/migrations/20261012120000_cuenta_corriente/migration.sql` (generado)
- Modify: `prisma/seed.ts` (reemplazo completo)
- Modify: `src/lib/format.ts` (agrega `formatDia`), `src/lib/periodo.ts` (quita `estaAlDia`)
- Create: `src/modules/cuenta-corriente/schema.ts`, `pagos.service.ts`, `consultas.service.ts`, `actions.ts`, `components/EstadoCargo.tsx`, `components/MovimientosTabla.tsx`
- Delete: `src/modules/cuotas/pagos.service.ts`, `tests/integration/pagos.test.ts`
- Modify: `src/modules/cuotas/schema.ts` (quita `pagoSchema`), `src/modules/cuotas/actions.ts` (quita `registrarPagoAction`), `src/modules/socios/service.ts` (quita los `include` de pagos)
- Modify: `src/app/c/[slug]/admin/page.tsx`, `src/app/c/[slug]/admin/socios/page.tsx`, `src/app/c/[slug]/admin/socios/[id]/page.tsx`, `src/app/c/[slug]/socio/page.tsx`
- Modify: `tests/helpers/factories.ts`, `tests/integration/socios.test.ts`, `tests/unit/validation.test.ts`, `tests/unit/periodo.test.ts`
- Test: `tests/unit/format.test.ts`, `tests/integration/registrar-pago.test.ts`, `tests/integration/cuenta-socio.test.ts`

**Interfaces:**
- Consumes: `vencimiento`, `estaVencido`, `estaAlDia`, `saldoAcumulado`, `inicioDelDia`, `rangoDelMes` (Task 1).
- Produces:
  - Modelos Prisma `Cargo`, `IntentoPago`; `Pago` sin `periodo`; `Club.diaVencimiento`; `Actividad.arancel`; enums `ConceptoCargo`, `EstadoCargo`, `EstadoIntento`, `MedioPago.ONLINE`.
  - `formatDia(fecha: Date): string`
  - `registrarPago(clubId: string, input: { socioId; cargoIds: string[]; medio; registradoPor?: string | null }, tx?: Prisma.TransactionClient): Promise<Pago>`
  - `cuentaSocio(clubId, socioId, hoy?): Promise<{ movimientos: (MovimientoCuenta & { saldo })[]; pendientes: (Cargo & { vencido: boolean })[]; deuda: number; deudaVencida: number; proximoVencimiento: Date | null; alDia: boolean }>`; `type CuentaSocio`
  - `estadoSocios(clubId, hoy?): Promise<Record<string, { deuda: number; moroso: boolean }>>`
  - `resumenClub(clubId, hoy?): Promise<{ periodo; activos; alDia; morosos; deudaVencida; recaudado; actividades }>`
  - `registrarPagoAction(slug, socioId, formData)` en `@/modules/cuenta-corriente/actions`
  - Componentes `EstadoCargo({ estado, vencido })`, `MovimientosTabla({ movimientos, seleccion? })`
  - Factories: `crearCargo(clubId, socioId, over?)`, `crearPagoDirecto(clubId, socioId, over?: { monto?; medio?; fecha? })`, `crearActividad` acepta `arancel`, `crearClub` acepta `diaVencimiento`.

- [ ] **Step 1: Detener el servidor de desarrollo si está corriendo**

```bash
lsof -tiTCP:3000 -sTCP:LISTEN | xargs -r kill
```

- [ ] **Step 2: Test de `formatDia` (falla primero)**

`tests/unit/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatDia } from "@/lib/format";

describe("formatDia", () => {
  it("muestra el día calendario de un vencimiento (medianoche UTC) sin correrlo por zona horaria", () => {
    expect(formatDia(new Date(Date.UTC(2026, 9, 10)))).toBe("10/10/2026");
  });
});
```

Run: `npx vitest run tests/unit/format.test.ts`
Expected: FAIL (`formatDia` no existe / is not a function).

Agregar al final de `src/lib/format.ts`:

```ts
/** Día calendario de una fecha guardada como medianoche UTC (vencimientos): no se corre por zona horaria. */
export const formatDia = (fecha: Date) => fecha.toLocaleDateString("es-AR", { timeZone: "UTC" });
```

Run: `npx vitest run tests/unit/format.test.ts`
Expected: PASS.

- [ ] **Step 3: Nuevo esquema**

Reemplazar `prisma/schema.prisma` completo por:

```prisma
// Esquema multi-tenant: toda entidad de negocio lleva clubId y
// todas las consultas de la app filtran por él (ver src/modules/*/service.ts).

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  // Migraciones por conexión directa (en Neon, la URL sin "-pooler"); en local es la misma URL.
  directUrl = env("DIRECT_URL")
}

enum Rol {
  SUPERADMIN
  ADMIN_CLUB
  SOCIO
}

enum MedioPago {
  EFECTIVO
  TRANSFERENCIA
  ONLINE
  OTRO
}

enum ConceptoCargo {
  CUOTA
  ACTIVIDAD
}

enum EstadoCargo {
  PENDIENTE
  PAGADO
  ANULADO
}

enum EstadoIntento {
  APROBADO
  RECHAZADO
  PENDIENTE
}

model Club {
  id             String        @id @default(cuid())
  nombre         String
  slug           String        @unique
  diaVencimiento Int           @default(10) // 1..28
  createdAt      DateTime      @default(now())
  usuarios       Usuario[]
  tiposSocio     TipoSocio[]
  socios         Socio[]
  pagos          Pago[]
  actividades    Actividad[]
  inscripciones  Inscripcion[]
  cargos         Cargo[]
  intentosPago   IntentoPago[]
}

// Cuenta de login. En v1 un email pertenece a un único club.
model Usuario {
  id        String   @id @default(cuid())
  email     String   @unique
  nombre    String?
  rol       Rol
  clubId    String?
  club      Club?    @relation(fields: [clubId], references: [id], onDelete: Cascade)
  socio     Socio?
  createdAt DateTime @default(now())

  @@index([clubId])
}

model TipoSocio {
  id           String  @id @default(cuid())
  clubId       String
  club         Club    @relation(fields: [clubId], references: [id], onDelete: Cascade)
  nombre       String
  cuotaMensual Int // pesos enteros
  socios       Socio[]

  @@unique([clubId, nombre])
}

model Socio {
  id            String        @id @default(cuid())
  clubId        String
  club          Club          @relation(fields: [clubId], references: [id], onDelete: Cascade)
  usuarioId     String?       @unique
  usuario       Usuario?      @relation(fields: [usuarioId], references: [id], onDelete: SetNull)
  nroSocio      Int
  nombre        String
  apellido      String
  dni           String
  email         String?
  tipoSocioId   String
  tipoSocio     TipoSocio     @relation(fields: [tipoSocioId], references: [id])
  activo        Boolean       @default(true)
  createdAt     DateTime      @default(now())
  pagos         Pago[]
  inscripciones Inscripcion[]
  cargos        Cargo[]
  intentosPago  IntentoPago[]

  @@unique([clubId, nroSocio])
  @@unique([clubId, dni])
  @@index([clubId])
}

// Un pago cancela uno o más cargos completos; monto = suma de sus cargos.
model Pago {
  id            String       @id @default(cuid())
  clubId        String
  club          Club         @relation(fields: [clubId], references: [id], onDelete: Cascade)
  socioId       String
  socio         Socio        @relation(fields: [socioId], references: [id], onDelete: Cascade)
  monto         Int
  medio         MedioPago
  fecha         DateTime     @default(now())
  registradoPor String? // usuarioId del admin; null si es ONLINE
  cargos        Cargo[]
  intento       IntentoPago?

  @@index([clubId, fecha])
}

model Actividad {
  id            String        @id @default(cuid())
  clubId        String
  club          Club          @relation(fields: [clubId], references: [id], onDelete: Cascade)
  nombre        String
  diaSemana     Int // 0 = domingo ... 6 = sábado
  hora          String // "HH:MM"
  cupo          Int
  arancel       Int           @default(0) // pesos por mes; 0 = gratuita
  activa        Boolean       @default(true)
  inscripciones Inscripcion[]
  cargos        Cargo[]

  @@index([clubId])
}

model Inscripcion {
  id          String    @id @default(cuid())
  clubId      String
  club        Club      @relation(fields: [clubId], references: [id], onDelete: Cascade)
  actividadId String
  actividad   Actividad @relation(fields: [actividadId], references: [id], onDelete: Cascade)
  socioId     String
  socio       Socio     @relation(fields: [socioId], references: [id], onDelete: Cascade)
  createdAt   DateTime  @default(now())

  @@unique([actividadId, socioId])
  @@index([clubId])
}

// Deuda del socio: cuota social del período o arancel de una actividad.
model Cargo {
  id              String        @id @default(cuid())
  clubId          String
  club            Club          @relation(fields: [clubId], references: [id], onDelete: Cascade)
  socioId         String
  socio           Socio         @relation(fields: [socioId], references: [id], onDelete: Cascade)
  concepto        ConceptoCargo
  actividadId     String?
  actividad       Actividad?    @relation(fields: [actividadId], references: [id], onDelete: SetNull)
  clave           String // "CUOTA" | "ACT:<actividadId>" (NULL en actividadId no sirve para UNIQUE)
  descripcion     String // se conserva aunque se borre la actividad
  periodo         String // "YYYY-MM"
  monto           Int
  vencimiento     DateTime // medianoche UTC del día de vencimiento
  estado          EstadoCargo   @default(PENDIENTE)
  pagoId          String?
  pago            Pago?         @relation(fields: [pagoId], references: [id], onDelete: SetNull)
  motivoAnulacion String?
  createdAt       DateTime      @default(now())

  @@unique([socioId, periodo, clave])
  @@index([clubId, periodo])
  @@index([clubId, estado, vencimiento])
}

// Cada intento de pago online, aprobado o no. Nunca guarda el número completo ni el CVV.
model IntentoPago {
  id                String        @id @default(cuid())
  clubId            String
  club              Club          @relation(fields: [clubId], references: [id], onDelete: Cascade)
  socioId           String
  socio             Socio         @relation(fields: [socioId], references: [id], onDelete: Cascade)
  cargoIds          String[]
  monto             Int
  estado            EstadoIntento
  pasarela          String // "simulada" | "mercadopago"
  referenciaExterna String?
  motivoRechazo     String?
  ultimos4          String?
  pagoId            String?       @unique
  pago              Pago?         @relation(fields: [pagoId], references: [id], onDelete: SetNull)
  createdAt         DateTime      @default(now())

  @@index([clubId, estado])
}
```

- [ ] **Step 4: Generar y aplicar la migración en la base local**

```bash
npx prisma migrate status    # debe decir "Database schema is up to date!" (base local en 0_init)
mkdir -p prisma/migrations/20261012120000_cuenta_corriente
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261012120000_cuenta_corriente/migration.sql
grep -c 'CREATE TABLE' prisma/migrations/20261012120000_cuenta_corriente/migration.sql   # 2 (Cargo, IntentoPago)
grep -n 'DROP COLUMN "periodo"' prisma/migrations/20261012120000_cuenta_corriente/migration.sql
npm run db:deploy
npx prisma generate
```

Expected: `db:deploy` informa "All migrations have been successfully applied"; `generate` OK. (La base local queda con los pagos demo sin período; el seed de este task la rehace.)

- [ ] **Step 5: Factories**

En `tests/helpers/factories.ts`:

- `crearClub`: cambiar la firma a `over: { nombre?: string; slug?: string; diaVencimiento?: number } = {}`.
- `crearActividad`: agregar `arancel?: number` al tipo de `over`.
- Reemplazar `crearPagoDirecto` completo y agregar `crearCargo` al final:

```ts
export function crearPagoDirecto(
  clubId: string,
  socioId: string,
  over: { monto?: number; medio?: "EFECTIVO" | "TRANSFERENCIA" | "ONLINE" | "OTRO"; fecha?: Date } = {},
) {
  return db.pago.create({ data: { clubId, socioId, monto: 10000, medio: "EFECTIVO", ...over } });
}

export function crearCargo(
  clubId: string,
  socioId: string,
  over: {
    concepto?: "CUOTA" | "ACTIVIDAD";
    actividadId?: string | null;
    clave?: string;
    descripcion?: string;
    periodo?: string;
    monto?: number;
    vencimiento?: Date;
    estado?: "PENDIENTE" | "PAGADO" | "ANULADO";
    pagoId?: string | null;
    createdAt?: Date;
  } = {},
) {
  const n = siguiente();
  return db.cargo.create({
    data: {
      clubId,
      socioId,
      concepto: "CUOTA",
      clave: `X:${n}`,
      descripcion: `Cargo ${n}`,
      periodo: "2026-10",
      monto: 10000,
      vencimiento: new Date(Date.UTC(2026, 9, 10)),
      ...over,
    },
  });
}
```

- [ ] **Step 6: Tests de `registrarPago` (fallan primero)**

`tests/integration/registrar-pago.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Club, Socio } from "@prisma/client";
import { db } from "@/lib/db";
import { mensajeDeError } from "@/lib/errors";
import { registrarPago } from "@/modules/cuenta-corriente/pagos.service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

let club: Club;
let socio: Socio;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
  socio = await f.crearSocio(club.id);
});

describe("registrarPago", () => {
  it("paga varios cargos: el monto es la suma y quedan PAGADOS y vinculados", async () => {
    const c1 = await f.crearCargo(club.id, socio.id, { monto: 15000 });
    const c2 = await f.crearCargo(club.id, socio.id, { monto: 5000 });
    const pago = await registrarPago(club.id, {
      socioId: socio.id,
      cargoIds: [c1.id, c2.id],
      medio: "EFECTIVO",
      registradoPor: "admin-1",
    });
    expect(pago).toMatchObject({ monto: 20000, medio: "EFECTIVO", registradoPor: "admin-1", socioId: socio.id });
    const cargos = await db.cargo.findMany({ where: { id: { in: [c1.id, c2.id] } } });
    expect(cargos.every((c) => c.estado === "PAGADO" && c.pagoId === pago.id)).toBe(true);
  });

  it("cuenta una sola vez los ids repetidos", async () => {
    const c = await f.crearCargo(club.id, socio.id, { monto: 15000 });
    const pago = await registrarPago(club.id, { socioId: socio.id, cargoIds: [c.id, c.id], medio: "OTRO" });
    expect(pago.monto).toBe(15000);
  });

  it("rechaza si algún cargo ya está pagado, sin cambios parciales", async () => {
    const pagado = await f.crearCargo(club.id, socio.id, { estado: "PAGADO" });
    const pendiente = await f.crearCargo(club.id, socio.id);
    await expect(
      registrarPago(club.id, { socioId: socio.id, cargoIds: [pagado.id, pendiente.id], medio: "EFECTIVO" }),
    ).rejects.toThrow("Alguno de los cargos ya fue pagado o anulado");
    expect(await db.pago.count()).toBe(0);
    expect((await db.cargo.findUnique({ where: { id: pendiente.id } }))?.estado).toBe("PENDIENTE");
  });

  it("rechaza un cargo anulado", async () => {
    const anulado = await f.crearCargo(club.id, socio.id, { estado: "ANULADO" });
    await expect(
      registrarPago(club.id, { socioId: socio.id, cargoIds: [anulado.id], medio: "EFECTIVO" }),
    ).rejects.toThrow("Alguno de los cargos ya fue pagado o anulado");
  });

  it("rechaza un cargo de otro socio o de otro club", async () => {
    const otroSocio = await f.crearSocio(club.id);
    const ajeno = await f.crearCargo(club.id, otroSocio.id);
    await expect(
      registrarPago(club.id, { socioId: socio.id, cargoIds: [ajeno.id], medio: "EFECTIVO" }),
    ).rejects.toThrow("Cargo no encontrado");

    const otroClub = await f.crearClub();
    const propio = await f.crearCargo(club.id, socio.id);
    await expect(
      registrarPago(otroClub.id, { socioId: socio.id, cargoIds: [propio.id], medio: "EFECTIVO" }),
    ).rejects.toThrow("Cargo no encontrado");
    expect(await db.pago.count()).toBe(0);
  });

  it("rechaza una lista vacía", async () => {
    await expect(registrarPago(club.id, { socioId: socio.id, cargoIds: [], medio: "EFECTIVO" })).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it("dentro de una transacción externa, se deshace si la transacción falla", async () => {
    const c = await f.crearCargo(club.id, socio.id);
    await expect(
      db.$transaction(async (tx) => {
        await registrarPago(club.id, { socioId: socio.id, cargoIds: [c.id], medio: "ONLINE" }, tx);
        throw new Error("falla después");
      }),
    ).rejects.toThrow("falla después");
    expect(await db.pago.count()).toBe(0);
    expect((await db.cargo.findUnique({ where: { id: c.id } }))?.estado).toBe("PENDIENTE");
  });

  it("dos pagos simultáneos del mismo cargo: exactamente uno se registra", async () => {
    const c = await f.crearCargo(club.id, socio.id);
    const resultados = await Promise.allSettled([
      registrarPago(club.id, { socioId: socio.id, cargoIds: [c.id], medio: "ONLINE" }),
      registrarPago(club.id, { socioId: socio.id, cargoIds: [c.id], medio: "EFECTIVO" }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of resultados) if (r.status === "rejected") expect(mensajeDeError(r.reason)).not.toBeNull();
    expect(await db.pago.count()).toBe(1);
  });
});
```

Run: `npx vitest run --project integration tests/integration/registrar-pago.test.ts`
Expected: FAIL — no resuelve `@/modules/cuenta-corriente/pagos.service`.

- [ ] **Step 7: Implementar schema y `registrarPago`**

`src/modules/cuenta-corriente/schema.ts`:

```ts
// Validación de entrada del módulo cuenta corriente.
import { z } from "zod";

export const registrarPagoSchema = z.object({
  socioId: z.string().min(1),
  cargoIds: z
    .array(z.string().min(1))
    .min(1, "Elegí al menos un cargo")
    .transform((ids) => [...new Set(ids)]),
  medio: z.enum(["EFECTIVO", "TRANSFERENCIA", "ONLINE", "OTRO"]),
  registradoPor: z.string().min(1).nullish(),
});
```

`src/modules/cuenta-corriente/pagos.service.ts`:

```ts
// Pagos: la única vía para cancelar cargos (la usan el pago manual del admin y el checkout online).
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { registrarPagoSchema } from "./schema";

/**
 * Registra un pago que cancela cargos completos del socio. Si alguno ya no está pendiente
 * (pagado en otra ventanilla, doble click, anulado) aborta todo: el chequeo de cantidad del
 * updateMany es lo que impide el doble pago. Con `tx` corre dentro de esa transacción.
 */
export async function registrarPago(clubId: string, input: unknown, tx?: Prisma.TransactionClient) {
  const data = registrarPagoSchema.parse(input);

  const registrar = async (t: Prisma.TransactionClient) => {
    const cargos = await t.cargo.findMany({
      where: { id: { in: data.cargoIds }, clubId, socioId: data.socioId },
      select: { monto: true },
    });
    if (cargos.length !== data.cargoIds.length) throw new DomainError("Cargo no encontrado");

    const pago = await t.pago.create({
      data: {
        clubId,
        socioId: data.socioId,
        monto: cargos.reduce((s, c) => s + c.monto, 0),
        medio: data.medio,
        registradoPor: data.registradoPor ?? null,
      },
    });
    const { count } = await t.cargo.updateMany({
      where: { id: { in: data.cargoIds }, clubId, socioId: data.socioId, estado: "PENDIENTE" },
      data: { estado: "PAGADO", pagoId: pago.id },
    });
    if (count !== data.cargoIds.length) throw new DomainError("Alguno de los cargos ya fue pagado o anulado");
    return pago;
  };

  return tx ? registrar(tx) : db.$transaction(registrar);
}
```

Run: `npx vitest run --project integration tests/integration/registrar-pago.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 8: Tests de consultas por socio y del resumen (fallan primero)**

`tests/integration/cuenta-socio.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Club, Socio } from "@prisma/client";
import { cuentaSocio, estadoSocios, resumenClub } from "@/modules/cuenta-corriente/consultas.service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const hoy = new Date(2026, 9, 15, 12); // 15/10/2026

let club: Club;
let socio: Socio;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
  socio = await f.crearSocio(club.id);
});

describe("cuentaSocio", () => {
  it("arma los movimientos con saldo, la deuda, lo vencido y el próximo vencimiento", async () => {
    await f.crearCargo(club.id, socio.id, {
      descripcion: "Cuota social 2026-09",
      monto: 15000,
      vencimiento: utc(2026, 9, 10),
      createdAt: new Date(2026, 8, 1),
    });
    const pago = await f.crearPagoDirecto(club.id, socio.id, { monto: 8000, fecha: new Date(2026, 8, 5) });
    await f.crearCargo(club.id, socio.id, {
      descripcion: "Natación 2026-09",
      monto: 8000,
      estado: "PAGADO",
      pagoId: pago.id,
      createdAt: new Date(2026, 8, 2),
    });
    await f.crearCargo(club.id, socio.id, {
      descripcion: "Anulado",
      monto: 3000,
      estado: "ANULADO",
      createdAt: new Date(2026, 9, 1),
    });
    await f.crearCargo(club.id, socio.id, {
      descripcion: "Cuota social 2026-10",
      monto: 5000,
      vencimiento: utc(2026, 10, 20),
      createdAt: new Date(2026, 9, 2),
    });

    const c = await cuentaSocio(club.id, socio.id, hoy);
    expect(c.movimientos.map((m) => [m.concepto, m.saldo])).toEqual([
      ["Cuota social 2026-09", 15000],
      ["Natación 2026-09", 23000],
      ["Pago (efectivo)", 15000],
      ["Anulado", 15000],
      ["Cuota social 2026-10", 20000],
    ]);
    expect(c.deuda).toBe(20000);
    expect(c.deudaVencida).toBe(15000);
    expect(c.proximoVencimiento).toEqual(utc(2026, 10, 20));
    expect(c.alDia).toBe(false);
    expect(c.pendientes.map((p) => [p.descripcion, p.vencido])).toEqual([
      ["Cuota social 2026-09", true],
      ["Cuota social 2026-10", false],
    ]);
  });

  it("sin cargos está al día y sin deuda", async () => {
    const c = await cuentaSocio(club.id, socio.id, hoy);
    expect(c).toMatchObject({ movimientos: [], deuda: 0, deudaVencida: 0, proximoVencimiento: null, alDia: true });
  });

  it("no muestra la cuenta de un socio de otro club", async () => {
    const otro = await f.crearClub();
    await expect(cuentaSocio(otro.id, socio.id, hoy)).rejects.toThrow("Socio no encontrado");
  });
});

describe("estadoSocios", () => {
  it("devuelve deuda y morosidad por socio, solo del club", async () => {
    const alDiaConDeuda = await f.crearSocio(club.id);
    const sinCargos = await f.crearSocio(club.id);
    await f.crearCargo(club.id, socio.id, { monto: 15000, vencimiento: utc(2026, 9, 10) });
    await f.crearCargo(club.id, alDiaConDeuda.id, { monto: 5000, vencimiento: utc(2026, 10, 20) });
    const otro = await f.crearClub();
    const ajeno = await f.crearSocio(otro.id);
    await f.crearCargo(otro.id, ajeno.id, { vencimiento: utc(2026, 9, 10) });

    const e = await estadoSocios(club.id, hoy);
    expect(e[socio.id]).toEqual({ deuda: 15000, moroso: true });
    expect(e[alDiaConDeuda.id]).toEqual({ deuda: 5000, moroso: false });
    expect(e[sinCargos.id]).toBeUndefined();
    expect(e[ajeno.id]).toBeUndefined();
  });
});

describe("resumenClub", () => {
  it("cuenta morosos entre activos, suma la deuda vencida (incluida la de bajas) y lo cobrado en el mes", async () => {
    const alDia = await f.crearSocio(club.id);
    const baja = await f.crearSocio(club.id, { activo: false });
    await f.crearCargo(club.id, socio.id, { monto: 15000, vencimiento: utc(2026, 9, 10) }); // moroso
    await f.crearCargo(club.id, alDia.id, { monto: 5000, vencimiento: utc(2026, 10, 20) }); // no vencido
    await f.crearCargo(club.id, baja.id, { monto: 7000, vencimiento: utc(2026, 9, 10) }); // vencido de una baja
    await f.crearPagoDirecto(club.id, alDia.id, { monto: 9000, fecha: new Date(2026, 9, 3) });
    await f.crearPagoDirecto(club.id, alDia.id, { monto: 1000, fecha: new Date(2026, 8, 30) }); // mes anterior
    await f.crearActividad(club.id);
    await f.crearActividad(club.id, { activa: false });
    const otro = await f.crearClub();
    const ajeno = await f.crearSocio(otro.id);
    await f.crearPagoDirecto(otro.id, ajeno.id, { monto: 99999, fecha: new Date(2026, 9, 3) });

    expect(await resumenClub(club.id, hoy)).toEqual({
      periodo: "2026-10",
      activos: 2,
      alDia: 1,
      morosos: 1,
      deudaVencida: 22000,
      recaudado: 9000,
      actividades: 1,
    });
  });
});
```

Run: `npx vitest run --project integration tests/integration/cuenta-socio.test.ts`
Expected: FAIL — no resuelve `consultas.service`.

- [ ] **Step 9: Implementar las consultas**

`src/modules/cuenta-corriente/consultas.service.ts`:

```ts
// Consultas de cuenta corriente: por socio, por club y resumen del tablero.
import type { EstadoCargo } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { periodoActual } from "@/lib/periodo";
import { estaAlDia, estaVencido, inicioDelDia, rangoDelMes, saldoAcumulado, type Movimiento } from "./reglas";

type MovimientoCuenta = Movimiento & { estado: EstadoCargo | null; vencido: boolean };

/** Cuenta corriente de un socio: movimientos con saldo, cargos pendientes y deuda. */
export async function cuentaSocio(clubId: string, socioId: string, hoy: Date = new Date()) {
  const socio = await db.socio.findFirst({ where: { id: socioId, clubId }, select: { id: true } });
  if (!socio) throw new DomainError("Socio no encontrado");

  const [cargos, pagos] = await Promise.all([
    db.cargo.findMany({ where: { clubId, socioId }, orderBy: [{ vencimiento: "asc" }, { createdAt: "asc" }] }),
    db.pago.findMany({ where: { clubId, socioId }, orderBy: { fecha: "asc" } }),
  ]);

  const movs: MovimientoCuenta[] = [
    ...cargos.map((c) => ({
      id: c.id,
      fecha: c.createdAt,
      tipo: "CARGO" as const,
      concepto: c.descripcion,
      monto: c.monto,
      anulado: c.estado === "ANULADO",
      estado: c.estado,
      vencido: estaVencido(c, hoy),
    })),
    ...pagos.map((p) => ({
      id: p.id,
      fecha: p.fecha,
      tipo: "PAGO" as const,
      concepto: `Pago (${p.medio.toLowerCase()})`,
      monto: p.monto,
      anulado: false,
      estado: null,
      vencido: false,
    })),
  ];

  const pendientes = cargos.filter((c) => c.estado === "PENDIENTE").map((c) => ({ ...c, vencido: estaVencido(c, hoy) }));
  const suma = (cs: { monto: number }[]) => cs.reduce((s, c) => s + c.monto, 0);

  return {
    movimientos: saldoAcumulado(movs),
    pendientes,
    deuda: suma(pendientes),
    deudaVencida: suma(pendientes.filter((c) => c.vencido)),
    proximoVencimiento: pendientes.find((c) => !c.vencido)?.vencimiento ?? null,
    alDia: estaAlDia(cargos, hoy),
  };
}

export type CuentaSocio = Awaited<ReturnType<typeof cuentaSocio>>;

/** Deuda pendiente y morosidad de cada socio del club con cargos pendientes. */
export async function estadoSocios(clubId: string, hoy: Date = new Date()) {
  const corte = inicioDelDia(hoy);
  const [deudas, vencidos] = await Promise.all([
    db.cargo.groupBy({ by: ["socioId"], where: { clubId, estado: "PENDIENTE" }, _sum: { monto: true } }),
    db.cargo.groupBy({
      by: ["socioId"],
      where: { clubId, estado: "PENDIENTE", vencimiento: { lt: corte } },
      _count: { _all: true },
    }),
  ]);
  const morosos = new Set(vencidos.map((v) => v.socioId));
  const estados: Record<string, { deuda: number; moroso: boolean }> = {};
  for (const d of deudas) estados[d.socioId] = { deuda: d._sum.monto ?? 0, moroso: morosos.has(d.socioId) };
  return estados;
}

/** Indicadores del tablero del club para el mes en curso. */
export async function resumenClub(clubId: string, hoy: Date = new Date()) {
  const periodo = periodoActual(hoy);
  const { desde, hasta } = rangoDelMes(periodo);
  const vencidoAntesDeHoy = { estado: "PENDIENTE" as const, vencimiento: { lt: inicioDelDia(hoy) } };
  const [activos, morosos, deudaVencida, recaudado, actividades] = await Promise.all([
    db.socio.count({ where: { clubId, activo: true } }),
    db.socio.count({ where: { clubId, activo: true, cargos: { some: vencidoAntesDeHoy } } }),
    db.cargo.aggregate({ where: { clubId, ...vencidoAntesDeHoy }, _sum: { monto: true } }),
    db.pago.aggregate({ where: { clubId, fecha: { gte: desde, lt: hasta } }, _sum: { monto: true } }),
    db.actividad.count({ where: { clubId, activa: true } }),
  ]);
  return {
    periodo,
    activos,
    alDia: activos - morosos,
    morosos,
    deudaVencida: deudaVencida._sum.monto ?? 0,
    recaudado: recaudado._sum.monto ?? 0,
    actividades,
  };
}
```

Run: `npx vitest run --project integration tests/integration/cuenta-socio.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 10: Retirar el pago por período de la v1**

```bash
git rm -q src/modules/cuotas/pagos.service.ts tests/integration/pagos.test.ts
```

- `src/modules/cuotas/schema.ts`: borrar el bloque `export const pagoSchema = ...` y la línea `import { PERIODO_REGEX } from "@/lib/periodo";`. Cambiar el comentario de la primera línea a `// Validación de entrada del módulo cuotas (tipos de socio).`
- `src/modules/cuotas/actions.ts`: reemplazar completo por:

```ts
"use server";

// Server Actions de cuotas (tipos de socio). Cada una re-verifica acceso con requireClub
// (los formularios no son una barrera de seguridad).
import { datos, ejecutar, rutaAdmin } from "@/lib/action";
import { requireClub } from "@/lib/session";
import { crearTipo } from "./tipos.service";

export async function crearTipoAction(slug: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/tipos`, async () => {
    const { club } = await requireClub(slug, "admin");
    await crearTipo(club.id, datos(formData));
  });
}
```

- `src/lib/periodo.ts`: borrar la función `estaAlDia` y su comentario (queda `PERIODO_REGEX` y `periodoActual`).
- `src/modules/socios/service.ts`: borrar `import { periodoActual } from "@/lib/periodo";`; en `listarSocios` borrar la línea `pagos: { where: { periodo: periodoActual() }, select: { id: true } },`; en `obtenerSocio` borrar la línea `pagos: { orderBy: { periodo: "desc" } },`. Cambiar el comentario de `cambiarEstadoSocio` a `/** Baja/alta lógica: la cuenta corriente se conserva. */`.
- `tests/unit/periodo.test.ts`: borrar el bloque `describe("estaAlDia", ...)` completo y cambiar el import a `import { periodoActual, PERIODO_REGEX } from "@/lib/periodo";`.
- `tests/unit/validation.test.ts`: borrar el bloque `describe("pagoSchema", ...)` completo y la línea `import { pagoSchema } from "@/modules/cuotas/schema";`.
- `tests/integration/socios.test.ts`: borrar `import { periodoActual } from "@/lib/periodo";` y reemplazar el último test por:

```ts
  it("listarSocios devuelve solo los del club, ordenados por número", async () => {
    const otro = await f.crearClub();
    const s2 = await f.crearSocio(club.id, { tipoSocioId: tipo.id, nroSocio: 2 });
    const s1 = await f.crearSocio(club.id, { tipoSocioId: tipo.id, nroSocio: 1 });
    await f.crearSocio(otro.id);

    const lista = await listarSocios(club.id);
    expect(lista.map((s) => s.id)).toEqual([s1.id, s2.id]);
  });
```

- [ ] **Step 11: Action y componentes de la cuenta corriente**

`src/modules/cuenta-corriente/actions.ts`:

```ts
"use server";

// Server Actions de cuenta corriente (admin de club). Cada una re-verifica acceso con
// requireClub (los formularios no son una barrera de seguridad).
import { ejecutar, rutaAdmin } from "@/lib/action";
import { requireClub } from "@/lib/session";
import { registrarPago } from "./pagos.service";

/** Pago en ventanilla de los cargos tildados (checkboxes "cargoIds"). */
export async function registrarPagoAction(slug: string, socioId: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/socios/${socioId}`, async () => {
    const { club, user } = await requireClub(slug, "admin");
    await registrarPago(club.id, {
      socioId,
      cargoIds: formData.getAll("cargoIds").map(String),
      medio: formData.get("medio"),
      registradoPor: user.id,
    });
  });
}
```

`src/modules/cuenta-corriente/components/EstadoCargo.tsx`:

```tsx
import type { EstadoCargo as Estado } from "@prisma/client";

const estilos = {
  Pendiente: "bg-amber-100 text-amber-800",
  Vencido: "bg-red-100 text-red-800",
  Pagado: "bg-emerald-100 text-emerald-800",
  Anulado: "bg-slate-100 text-slate-500",
} as const;

/** Estado de un cargo; un pendiente con vencimiento pasado se muestra como "Vencido". */
export function EstadoCargo({ estado, vencido }: { estado: Estado; vencido: boolean }) {
  const etiqueta =
    estado === "PENDIENTE" ? (vencido ? "Vencido" : "Pendiente") : estado === "PAGADO" ? "Pagado" : "Anulado";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${estilos[etiqueta]}`}>{etiqueta}</span>;
}
```

`src/modules/cuenta-corriente/components/MovimientosTabla.tsx`:

```tsx
import { Tabla } from "@/components/ui";
import { formatFecha, formatPesos } from "@/lib/format";
import type { CuentaSocio } from "../consultas.service";
import { EstadoCargo } from "./EstadoCargo";

/**
 * Cuenta corriente de un socio con saldo acumulado. Con `seleccion`, cada cargo pendiente lleva
 * un checkbox con ese name; la página provee el <form> que envuelve la tabla.
 */
export function MovimientosTabla({
  movimientos,
  seleccion,
}: {
  movimientos: CuentaSocio["movimientos"];
  seleccion?: string;
}) {
  if (movimientos.length === 0) return <p className="text-sm text-slate-500">Sin movimientos.</p>;
  const headers = ["Fecha", "Concepto", "Cargo", "Pago", "Saldo", "Estado"];
  return (
    <Tabla headers={seleccion ? ["✓", ...headers] : headers}>
      {movimientos.map((m) => (
        <tr key={`${m.tipo}-${m.id}`} className={m.anulado ? "text-slate-400 line-through" : ""}>
          {seleccion && (
            <td className="py-2 pr-2">
              {m.tipo === "CARGO" && m.estado === "PENDIENTE" && (
                <input type="checkbox" name={seleccion} value={m.id} aria-label={`Seleccionar ${m.concepto}`} />
              )}
            </td>
          )}
          <td className="py-2 pr-4">{formatFecha(m.fecha)}</td>
          <td className="py-2 pr-4">{m.concepto}</td>
          <td className="py-2 pr-4">{m.tipo === "CARGO" ? formatPesos(m.monto) : ""}</td>
          <td className="py-2 pr-4">{m.tipo === "PAGO" ? formatPesos(m.monto) : ""}</td>
          <td className="py-2 pr-4 font-medium">{formatPesos(m.saldo)}</td>
          <td className="py-2 pr-4">{m.estado && <EstadoCargo estado={m.estado} vencido={m.vencido} />}</td>
        </tr>
      ))}
    </Tabla>
  );
}
```

- [ ] **Step 12: Pantallas**

`src/app/c/[slug]/admin/page.tsx`, reemplazo completo:

```tsx
import { requireClub } from "@/lib/session";
import { resumenClub } from "@/modules/cuenta-corriente/consultas.service";
import { formatPesos } from "@/lib/format";
import { Stat, Titulo } from "@/components/ui";

export default async function ResumenClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const r = await resumenClub(club.id);

  return (
    <>
      <Titulo sub={`Período ${r.periodo}`}>Resumen</Titulo>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Socios activos" valor={r.activos} />
        <Stat label="Al día" valor={r.alDia} />
        <Stat label="Morosos" valor={r.morosos} />
        <Stat label="Deuda vencida" valor={formatPesos(r.deudaVencida)} />
        <Stat label="Recaudado del mes" valor={formatPesos(r.recaudado)} />
        <Stat label="Actividades" valor={r.actividades} />
      </div>
    </>
  );
}
```

`src/app/c/[slug]/admin/socios/page.tsx`:
- Agregar los imports `import { estadoSocios } from "@/modules/cuenta-corriente/consultas.service";` y `import { formatPesos } from "@/lib/format";`.
- Reemplazar `const [socios, tipos, msg] = await Promise.all([listarSocios(club.id), listarTipos(club.id), searchParams]);` por:

```tsx
  const [socios, tipos, estados, msg] = await Promise.all([
    listarSocios(club.id),
    listarTipos(club.id),
    estadoSocios(club.id),
    searchParams,
  ]);
```

- `sub="Altas, modificaciones y estado de cuota del mes"` → `sub="Altas, modificaciones y estado de cuenta"`.
- Headers `["N°", "Socio", "DNI", "Tipo", "Cuota del mes", "Estado"]` → `["N°", "Socio", "DNI", "Tipo", "Cuenta", "Deuda", "Estado"]`.
- Reemplazar la celda del badge (`<td>` que contiene `<Badge ok={s.pagos.length > 0}>`) por:

```tsx
                  <td className="py-2 pr-4">
                    <Badge ok={!estados[s.id]?.moroso}>{estados[s.id]?.moroso ? "Moroso" : "Al día"}</Badge>
                  </td>
                  <td className="py-2 pr-4">{formatPesos(estados[s.id]?.deuda ?? 0)}</td>
```

`src/app/c/[slug]/admin/socios/[id]/page.tsx`, reemplazo completo:

```tsx
import { notFound } from "next/navigation";
import { requireClub } from "@/lib/session";
import { obtenerSocio } from "@/modules/socios/service";
import { listarTipos } from "@/modules/cuotas/tipos.service";
import { cuentaSocio } from "@/modules/cuenta-corriente/consultas.service";
import { DomainError } from "@/lib/errors";
import { formatPesos } from "@/lib/format";
import { Aviso, Badge, Boton, Card, Selector, Titulo, type SearchParams } from "@/components/ui";
import { registrarPagoAction } from "@/modules/cuenta-corriente/actions";
import { MovimientosTabla } from "@/modules/cuenta-corriente/components/MovimientosTabla";
import { actualizarSocioAction, cambiarEstadoSocioAction } from "@/modules/socios/actions";
import { SocioForm } from "@/modules/socios/components/SocioForm";

export default async function SocioDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: SearchParams;
}) {
  const { slug, id } = await params;
  const { club } = await requireClub(slug, "admin");
  const socio = await obtenerSocio(club.id, id).catch((e) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  const [tipos, cuenta, msg] = await Promise.all([listarTipos(club.id), cuentaSocio(club.id, socio.id), searchParams]);

  return (
    <>
      <Titulo sub={`Socio N° ${socio.nroSocio} · ${socio.activo ? "Activo" : "Dado de baja"}`}>
        {socio.apellido}, {socio.nombre}
      </Titulo>
      <Aviso {...msg} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Datos">
          <SocioForm action={actualizarSocioAction.bind(null, slug, socio.id)} tipos={tipos} socio={socio} />
          <form action={cambiarEstadoSocioAction.bind(null, slug, socio.id, !socio.activo)} className="mt-4">
            <Boton variante={socio.activo ? "peligro" : "secundario"} className="w-full">
              {socio.activo ? "Dar de baja" : "Reactivar"}
            </Boton>
          </form>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Cuenta corriente">
            <p className="mb-4 text-sm text-slate-600">
              <Badge ok={cuenta.alDia}>{cuenta.alDia ? "Al día" : "Con deuda vencida"}</Badge> Deuda:{" "}
              <strong>{formatPesos(cuenta.deuda)}</strong> · Vencida: {formatPesos(cuenta.deudaVencida)}
            </p>
            <form action={registrarPagoAction.bind(null, slug, socio.id)} className="flex flex-col gap-4">
              <MovimientosTabla movimientos={cuenta.movimientos} seleccion="cargoIds" />
              {cuenta.pendientes.length > 0 && (
                <div className="flex flex-wrap items-end gap-3">
                  <Selector label="Medio" name="medio" defaultValue="EFECTIVO">
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="OTRO">Otro</option>
                  </Selector>
                  <Boton type="submit">Registrar pago de los cargos tildados</Boton>
                </div>
              )}
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
```

`src/app/c/[slug]/socio/page.tsx`, reemplazo completo:

```tsx
import { requireClub } from "@/lib/session";
import { obtenerSocio } from "@/modules/socios/service";
import { actividadesParaSocio } from "@/modules/actividades/service";
import { cuentaSocio } from "@/modules/cuenta-corriente/consultas.service";
import { DIAS, formatDia, formatPesos } from "@/lib/format";
import { Aviso, Badge, Boton, Card, Tabla, Titulo, type SearchParams } from "@/components/ui";
import { cancelarAction, inscribirAction } from "@/modules/actividades/actions";
import { MovimientosTabla } from "@/modules/cuenta-corriente/components/MovimientosTabla";

export default async function SocioHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { club, user } = await requireClub(slug, "socio");
  const [socio, actividades, cuenta, msg] = await Promise.all([
    obtenerSocio(club.id, user.socioId!),
    actividadesParaSocio(club.id, user.socioId!),
    cuentaSocio(club.id, user.socioId!),
    searchParams,
  ]);

  return (
    <>
      <p className="mb-1 text-sm font-medium uppercase tracking-wide text-emerald-700">{club.nombre}</p>
      <Titulo sub={`Socio N° ${socio.nroSocio} · ${socio.tipoSocio.nombre}`}>Hola, {socio.nombre}</Titulo>
      <Aviso {...msg} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Mi cuenta">
          <p className="mb-2">
            <Badge ok={cuenta.alDia}>{cuenta.alDia ? "Al día" : "Con deuda vencida"}</Badge>
          </p>
          <p className="text-sm text-slate-600">
            Saldo pendiente: <strong>{formatPesos(cuenta.deuda)}</strong>
          </p>
          {cuenta.deudaVencida > 0 && (
            <p className="text-sm text-red-700">Vencido: {formatPesos(cuenta.deudaVencida)}</p>
          )}
          {cuenta.proximoVencimiento && (
            <p className="text-sm text-slate-600">Próximo vencimiento: {formatDia(cuenta.proximoVencimiento)}</p>
          )}
          <p className="mt-2 text-sm text-slate-500">Cuota mensual: {formatPesos(socio.tipoSocio.cuotaMensual)}</p>
        </Card>

        <div className="lg:col-span-2">
          <Card title="Actividades">
            <Tabla headers={["Actividad", "Horario", "Cupo", ""]}>
              {actividades.map((a) => {
                const lleno = a.inscriptos >= a.cupo;
                return (
                  <tr key={a.id}>
                    <td className="py-2 pr-4 font-medium">{a.nombre}</td>
                    <td className="py-2 pr-4">
                      {DIAS[a.diaSemana]} {a.hora}
                    </td>
                    <td className="py-2 pr-4">
                      {a.inscriptos} / {a.cupo}
                    </td>
                    <td className="py-2 text-right">
                      {a.inscripto ? (
                        <form action={cancelarAction.bind(null, slug, a.id)}>
                          <Boton variante="peligro">Cancelar</Boton>
                        </form>
                      ) : (
                        <form action={inscribirAction.bind(null, slug, a.id)}>
                          <Boton disabled={lleno} className="disabled:opacity-40">
                            {lleno ? "Sin cupo" : "Inscribirme"}
                          </Boton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Tabla>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card title="Cuenta corriente">
            <MovimientosTabla movimientos={cuenta.movimientos} />
          </Card>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 13: Seed de demo**

Reemplazar `prisma/seed.ts` completo:

```ts
// Datos de demo. Idempotente: borra todo y vuelve a crear.
// Escenario: cargos del mes anterior y del actual; Martín y Valentina al día, Lucía y Sofía con
// deuda por vencer, Juan moroso (no pagó el mes anterior). Pagos en efectivo, transferencia y online.
import { PrismaClient, type MedioPago, type Socio } from "@prisma/client";
import { periodoActual } from "../src/lib/periodo";
import { vencimiento } from "../src/modules/cuenta-corriente/reglas";

const prisma = new PrismaClient();

async function main() {
  await prisma.club.deleteMany();
  await prisma.usuario.deleteMany();

  const hoy = new Date();
  const actual = periodoActual(hoy);
  const anterior = periodoActual(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 15));
  // Vencimiento una semana adelante para que los cargos del mes estén "por vencer" en la demo
  // (desde el día 22 queda en 28, el máximo permitido).
  const diaVencimiento = Math.min(28, hoy.getDate() + 7);

  const superEmail = process.env.SUPERADMIN_EMAIL || "admin@gestiondesocios.com";
  await prisma.usuario.create({ data: { email: superEmail, nombre: "Admin general", rol: "SUPERADMIN" } });

  const club = await prisma.club.create({ data: { nombre: "Club Atlético Demo", slug: "demo", diaVencimiento } });
  const admin = await prisma.usuario.create({
    data: { email: "admin@demo.club", nombre: "Admin Demo", rol: "ADMIN_CLUB", clubId: club.id },
  });

  const activo = await prisma.tipoSocio.create({ data: { clubId: club.id, nombre: "Activo", cuotaMensual: 15000 } });
  const cadete = await prisma.tipoSocio.create({ data: { clubId: club.id, nombre: "Cadete", cuotaMensual: 8000 } });

  const socioUser = await prisma.usuario.create({
    data: { email: "socio@demo.club", nombre: "Lucía Gómez", rol: "SOCIO", clubId: club.id },
  });

  const base = [
    { nombre: "Lucía", apellido: "Gómez", dni: "30111222", tipo: activo, usuarioId: socioUser.id, email: "socio@demo.club" },
    { nombre: "Martín", apellido: "Pérez", dni: "28999888", tipo: activo },
    { nombre: "Sofía", apellido: "Díaz", dni: "45123456", tipo: cadete },
    { nombre: "Juan", apellido: "López", dni: "33444555", tipo: activo },
    { nombre: "Valentina", apellido: "Ruiz", dni: "46777888", tipo: cadete },
  ];

  const socios: Socio[] = [];
  for (const [i, s] of base.entries()) {
    socios.push(
      await prisma.socio.create({
        data: {
          clubId: club.id, nroSocio: i + 1, nombre: s.nombre, apellido: s.apellido, dni: s.dni,
          email: s.email ?? null, tipoSocioId: s.tipo.id, usuarioId: s.usuarioId ?? null,
        },
      }),
    );
  }
  // Juan (socios[3]) no paga el mes anterior: queda moroso.
  const [lucia, martin, sofia, , valentina] = socios;
  const cuota = (s: Socio) => (s.tipoSocioId === activo.id ? activo.cuotaMensual : cadete.cuotaMensual);

  const futbol = await prisma.actividad.create({
    data: { clubId: club.id, nombre: "Fútbol infantil", diaSemana: 1, hora: "18:00", cupo: 20, arancel: 6000 },
  });
  const natacion = await prisma.actividad.create({
    data: { clubId: club.id, nombre: "Natación", diaSemana: 3, hora: "19:00", cupo: 2, arancel: 5000 },
  });
  await prisma.actividad.create({ data: { clubId: club.id, nombre: "Yoga", diaSemana: 6, hora: "10:00", cupo: 15 } });

  await prisma.inscripcion.create({ data: { clubId: club.id, actividadId: futbol.id, socioId: sofia.id } });
  await prisma.inscripcion.create({ data: { clubId: club.id, actividadId: natacion.id, socioId: lucia.id } });

  // Cargos de dos meses, como los generaría el botón "Generar cargos".
  for (const periodo of [anterior, actual]) {
    const vence = vencimiento(periodo, diaVencimiento);
    for (const s of socios) {
      await prisma.cargo.create({
        data: {
          clubId: club.id, socioId: s.id, concepto: "CUOTA", clave: "CUOTA",
          descripcion: `Cuota social ${periodo}`, periodo, monto: cuota(s), vencimiento: vence,
        },
      });
    }
    for (const [s, a] of [[sofia, futbol], [lucia, natacion]] as const) {
      await prisma.cargo.create({
        data: {
          clubId: club.id, socioId: s.id, concepto: "ACTIVIDAD", actividadId: a.id, clave: `ACT:${a.id}`,
          descripcion: `${a.nombre} ${periodo}`, periodo, monto: a.arancel, vencimiento: vence,
        },
      });
    }
  }

  async function pagar(socio: Socio, periodos: string[], medio: MedioPago) {
    const cargos = await prisma.cargo.findMany({ where: { socioId: socio.id, periodo: { in: periodos } } });
    const pago = await prisma.pago.create({
      data: {
        clubId: club.id, socioId: socio.id, medio,
        monto: cargos.reduce((s, c) => s + c.monto, 0),
        registradoPor: medio === "ONLINE" ? null : admin.id,
      },
    });
    await prisma.cargo.updateMany({
      where: { id: { in: cargos.map((c) => c.id) } },
      data: { estado: "PAGADO", pagoId: pago.id },
    });
    return { pago, cargos };
  }

  await pagar(martin, [anterior], "EFECTIVO");
  await pagar(martin, [actual], "TRANSFERENCIA");
  await pagar(valentina, [anterior, actual], "TRANSFERENCIA");
  await pagar(sofia, [anterior], "EFECTIVO");
  const online = await pagar(lucia, [anterior], "ONLINE");
  await prisma.intentoPago.create({
    data: {
      clubId: club.id, socioId: lucia.id, cargoIds: online.cargos.map((c) => c.id), monto: online.pago.monto,
      estado: "APROBADO", pasarela: "simulada", referenciaExterna: "SIM-seed", ultimos4: "0001", pagoId: online.pago.id,
    },
  });

  console.log(`Seed OK. Logins demo: ${superEmail} | admin@demo.club | socio@demo.club`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

Run: `npm run db:seed`
Expected: `Seed OK. ...`.

- [ ] **Step 14: Verificar y commitear**

```bash
grep -rn "periodo: periodoActual\|pagoSchema\|cuotas/pagos.service\|estaAlDia(socio" src tests prisma   # sin resultados
npm run typecheck
npm test
```

Expected: typecheck sin errores; todos los tests PASS.

```bash
git add -A prisma src tests
git commit -m "Reemplaza el pago por período por cargos y pagos de cuenta corriente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Generación de cargos, anulación, día de vencimiento y cuenta del club

**Files:**
- Create: `src/modules/cuenta-corriente/cargos.service.ts`, `src/modules/cuenta-corriente/components/CuentaClub.tsx`, `src/app/c/[slug]/admin/cuenta/page.tsx`
- Modify: `src/modules/cuenta-corriente/schema.ts`, `consultas.service.ts` (agrega `cuentaClub`), `actions.ts` (reemplazo completo)
- Modify: `src/lib/action.ts` (`ejecutar` acepta un mensaje de éxito), `src/components/ui.tsx` (`Aviso` muestra ese mensaje)
- Modify: `src/modules/clubs/schema.ts`, `src/modules/clubs/service.ts`, `src/modules/clubs/actions.ts`
- Modify: `src/app/c/[slug]/admin/layout.tsx` (pestaña), `src/app/c/[slug]/admin/tipos/page.tsx` (reemplazo completo), `src/app/c/[slug]/admin/socios/[id]/page.tsx` (card de anulación)
- Test: `tests/unit/action.test.ts`, `tests/unit/validation.test.ts`, `tests/integration/cargos.test.ts`

**Interfaces:**
- Consumes: `vencimiento`, `periodosGenerables`, `rangoDelMes`, `inicioDelDia` (Task 1); `cuentaSocio` (Task 3).
- Produces:
  - `generarCargosPeriodo(clubId: string, input: { periodo: string } | unknown, hoy?: Date): Promise<{ creados: number; existentes: number }>`
  - `anularCargo(clubId: string, cargoId: string, input: { motivo: string } | unknown): Promise<void>`
  - `claveActividad(actividadId: string): string`, que devuelve `"ACT:<id>"` (la usa la Task 5)
  - `cuentaClub(clubId, hoy?)`, que devuelve `{ periodo, cobrado, cobradoOnline, cobradoVentanilla, deudaPendiente, deudaVencida, acreditaciones: (Pago & { socio: { nombre; apellido; nroSocio } })[], intentosSinPago }`; `type CuentaClubData`
  - `<CuentaClub cuenta={CuentaClubData} />`
  - `actualizarConfigClub(clubId, input: { diaVencimiento })`, `configClubSchema`
  - `ejecutar(ruta, fn)`: si `fn` devuelve un string, redirige con `?ok=<mensaje>`; si no, con `?ok=1`
  - Actions: `generarCargosAction(slug, formData)`, `anularCargoAction(slug, socioId, cargoId, formData)`, `actualizarConfigClubAction(slug, formData)`

- [ ] **Step 1: Test de `ejecutar` con mensaje (falla primero)**

`tests/unit/action.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { ejecutar } from "@/lib/action";
import { DomainError } from "@/lib/errors";

describe("ejecutar", () => {
  it("usa el mensaje que devuelve la acción", async () => {
    await expect(ejecutar("/x", async () => "Se generaron 3 cargos")).rejects.toThrow(
      "REDIRECT:/x?ok=Se%20generaron%203%20cargos",
    );
  });

  it("sin mensaje redirige con ok=1", async () => {
    await expect(ejecutar("/x", async () => undefined)).rejects.toThrow("REDIRECT:/x?ok=1");
  });

  it("un error de dominio vuelve con ?error=", async () => {
    await expect(
      ejecutar("/x", async () => {
        throw new DomainError("No hay cupo");
      }),
    ).rejects.toThrow("REDIRECT:/x?error=No%20hay%20cupo");
  });
});
```

Run: `npx vitest run tests/unit/action.test.ts`
Expected: FAIL en el primer test (redirige con `ok=1`).

En `src/lib/action.ts`, reemplazar la función `ejecutar` (y su comentario) por:

```ts
/**
 * Envuelve un Server Action: ejecuta, revalida y vuelve a `ruta` con ?ok=<mensaje> (o ?ok=1 si la
 * acción no devuelve un texto) o ?error=<mensaje>. Errores inesperados (y los redirect de los
 * guards) se relanzan.
 */
export async function ejecutar(ruta: string, fn: () => Promise<unknown>): Promise<never> {
  let error: string | null = null;
  let ok = "1";
  try {
    const r = await fn();
    if (typeof r === "string") ok = r;
  } catch (e) {
    error = mensajeDeError(e);
    if (error === null) throw e;
  }
  revalidatePath(ruta);
  redirect(error ? `${ruta}?error=${encodeURIComponent(error)}` : `${ruta}?ok=${encodeURIComponent(ok)}`);
}
```

En `src/components/ui.tsx`, en `Aviso`, reemplazar `>Cambios guardados</p>` por `>{ok === "1" ? "Cambios guardados" : ok}</p>`.

Run: `npx vitest run tests/unit/action.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 2: Día de vencimiento del club (test primero)**

En `tests/unit/validation.test.ts`: cambiar `import { clubSchema } from "@/modules/clubs/schema";` por `import { clubSchema, configClubSchema } from "@/modules/clubs/schema";` y agregar al final:

```ts
describe("configClubSchema", () => {
  it("acepta días de vencimiento de 1 a 28 (desde FormData)", () => {
    expect(configClubSchema.parse({ diaVencimiento: "1" }).diaVencimiento).toBe(1);
    expect(configClubSchema.parse({ diaVencimiento: "28" }).diaVencimiento).toBe(28);
  });

  it("rechaza 0 y 29", () => {
    expect(configClubSchema.safeParse({ diaVencimiento: 0 }).success).toBe(false);
    expect(configClubSchema.safeParse({ diaVencimiento: 29 }).success).toBe(false);
  });
});
```

Run: `npx vitest run tests/unit/validation.test.ts`. Expected: FAIL (`configClubSchema` undefined).

Agregar a `src/modules/clubs/schema.ts` (y `entero` al import de `@/lib/validation`):

```ts
/** Configuración del club editable por su admin. */
export const configClubSchema = z.object({
  diaVencimiento: entero(1, 28),
});
```

Run: `npx vitest run tests/unit/validation.test.ts`. Expected: PASS.

Agregar a `src/modules/clubs/service.ts` (y `configClubSchema` al import de `./schema`):

```ts
/** Día de vencimiento de las cuotas del club (1..28). Aplica a los cargos que se generen desde ahora. */
export function actualizarConfigClub(clubId: string, input: unknown) {
  const data = configClubSchema.parse(input);
  return db.club.update({ where: { id: clubId }, data });
}
```

Agregar a `src/modules/clubs/actions.ts` los imports `import { datos, rutaAdmin } from "@/lib/action";` (junto a `ejecutar`), `import { requireClub } from "@/lib/session";` (junto a `requireSuperadmin`), cambiar el import del servicio a `import { actualizarConfigClub, crearClub } from "./service";` y agregar:

```ts
export async function actualizarConfigClubAction(slug: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/tipos`, async () => {
    const { club } = await requireClub(slug, "admin");
    await actualizarConfigClub(club.id, datos(formData));
    return "Día de vencimiento actualizado";
  });
}
```

- [ ] **Step 3: Tests de cargos y cuenta del club (fallan primero)**

`tests/integration/cargos.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Club } from "@prisma/client";
import { db } from "@/lib/db";
import { actualizarConfigClub } from "@/modules/clubs/service";
import { anularCargo, generarCargosPeriodo } from "@/modules/cuenta-corriente/cargos.service";
import { cuentaClub } from "@/modules/cuenta-corriente/consultas.service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const hoy = new Date(2026, 9, 15, 12); // 15/10/2026

let club: Club;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub({ diaVencimiento: 10 });
});

describe("generarCargosPeriodo", () => {
  it("crea la cuota de cada socio activo y el arancel de sus actividades pagas activas", async () => {
    const tipo = await f.crearTipo(club.id, { cuotaMensual: 15000 });
    const socio = await f.crearSocio(club.id, { tipoSocioId: tipo.id });
    const natacion = await f.crearActividad(club.id, { nombre: "Natación", arancel: 5000 });
    await f.inscribirDirecto(club.id, natacion.id, socio.id);

    expect(await generarCargosPeriodo(club.id, { periodo: "2026-10" }, hoy)).toEqual({ creados: 2, existentes: 0 });
    const cargos = await db.cargo.findMany({ where: { socioId: socio.id }, orderBy: { monto: "desc" } });
    expect(cargos.map((c) => [c.clave, c.descripcion, c.monto, c.estado])).toEqual([
      ["CUOTA", "Cuota social 2026-10", 15000, "PENDIENTE"],
      [`ACT:${natacion.id}`, "Natación 2026-10", 5000, "PENDIENTE"],
    ]);
    expect(cargos.every((c) => c.vencimiento.getTime() === utc(2026, 10, 10).getTime())).toBe(true);
  });

  it("omite socios inactivos, cuotas en $0, actividades gratuitas o inactivas y socios de otro club", async () => {
    const gratis = await f.crearTipo(club.id, { cuotaMensual: 0 });
    const socioGratis = await f.crearSocio(club.id, { tipoSocioId: gratis.id });
    await f.crearSocio(club.id, { activo: false });
    const yoga = await f.crearActividad(club.id, { arancel: 0 });
    const cerrada = await f.crearActividad(club.id, { arancel: 4000, activa: false });
    await f.inscribirDirecto(club.id, yoga.id, socioGratis.id);
    await f.inscribirDirecto(club.id, cerrada.id, socioGratis.id);
    const otro = await f.crearClub();
    await f.crearSocio(otro.id);

    expect(await generarCargosPeriodo(club.id, { periodo: "2026-10" }, hoy)).toEqual({ creados: 0, existentes: 0 });
    expect(await db.cargo.count()).toBe(0);
  });

  it("es idempotente: la segunda corrida no crea nada", async () => {
    await f.crearSocio(club.id);
    await f.crearSocio(club.id);
    await generarCargosPeriodo(club.id, { periodo: "2026-10" }, hoy);
    expect(await generarCargosPeriodo(club.id, { periodo: "2026-10" }, hoy)).toEqual({ creados: 0, existentes: 2 });
    expect(await db.cargo.count()).toBe(2);
  });

  it("dos corridas simultáneas no duplican cargos", async () => {
    for (let i = 0; i < 5; i++) await f.crearSocio(club.id);
    const [a, b] = await Promise.all([
      generarCargosPeriodo(club.id, { periodo: "2026-10" }, hoy),
      generarCargosPeriodo(club.id, { periodo: "2026-10" }, hoy),
    ]);
    expect(a.creados + b.creados).toBe(5);
    expect(await db.cargo.count()).toBe(5);
  });

  it("solo acepta el período actual o el siguiente", async () => {
    await expect(generarCargosPeriodo(club.id, { periodo: "2026-09" }, hoy)).rejects.toThrow(
      "Solo se pueden generar cargos del mes actual o del siguiente",
    );
    await expect(generarCargosPeriodo(club.id, { periodo: "2026-12" }, hoy)).rejects.toThrow(
      "Solo se pueden generar cargos del mes actual o del siguiente",
    );
    await expect(generarCargosPeriodo(club.id, { periodo: "2026-11" }, hoy)).resolves.toBeTruthy();
  });

  it("usa el día de vencimiento del club", async () => {
    await actualizarConfigClub(club.id, { diaVencimiento: "5" });
    const socio = await f.crearSocio(club.id);
    await generarCargosPeriodo(club.id, { periodo: "2026-11" }, hoy);
    const [cargo] = await db.cargo.findMany({ where: { socioId: socio.id } });
    expect(cargo.vencimiento).toEqual(utc(2026, 11, 5));
  });
});

describe("anularCargo", () => {
  it("anula un pendiente guardando el motivo", async () => {
    const socio = await f.crearSocio(club.id);
    const c = await f.crearCargo(club.id, socio.id);
    await anularCargo(club.id, c.id, { motivo: "Cargado por error" });
    expect(await db.cargo.findUnique({ where: { id: c.id } })).toMatchObject({
      estado: "ANULADO",
      motivoAnulacion: "Cargado por error",
    });
  });

  it("exige motivo", async () => {
    const socio = await f.crearSocio(club.id);
    const c = await f.crearCargo(club.id, socio.id);
    await expect(anularCargo(club.id, c.id, { motivo: "" })).rejects.toBeInstanceOf(ZodError);
  });

  it("no anula cargos pagados", async () => {
    const socio = await f.crearSocio(club.id);
    const c = await f.crearCargo(club.id, socio.id, { estado: "PAGADO" });
    await expect(anularCargo(club.id, c.id, { motivo: "Error" })).rejects.toThrow(
      "Solo se pueden anular cargos pendientes",
    );
  });

  it("no anula cargos de otro club", async () => {
    const otro = await f.crearClub();
    const ajeno = await f.crearSocio(otro.id);
    const c = await f.crearCargo(otro.id, ajeno.id);
    await expect(anularCargo(club.id, c.id, { motivo: "Error" })).rejects.toThrow("Cargo no encontrado");
    expect((await db.cargo.findUnique({ where: { id: c.id } }))?.estado).toBe("PENDIENTE");
  });
});

describe("cuentaClub", () => {
  it("resume lo cobrado en el mes por medio, la deuda y las acreditaciones, solo del club", async () => {
    const socio = await f.crearSocio(club.id, { nombre: "Ana" });
    await f.crearPagoDirecto(club.id, socio.id, { monto: 15000, medio: "ONLINE", fecha: new Date(2026, 9, 5) });
    await f.crearPagoDirecto(club.id, socio.id, { monto: 8000, medio: "EFECTIVO", fecha: new Date(2026, 9, 7) });
    await f.crearPagoDirecto(club.id, socio.id, { monto: 1000, fecha: new Date(2026, 8, 28) }); // mes anterior
    await f.crearCargo(club.id, socio.id, { monto: 5000, vencimiento: utc(2026, 10, 20) });
    await f.crearCargo(club.id, socio.id, { monto: 3000, vencimiento: utc(2026, 9, 10) });
    await db.intentoPago.create({
      data: { clubId: club.id, socioId: socio.id, cargoIds: [], monto: 1, estado: "APROBADO", pasarela: "simulada" },
    });
    await db.intentoPago.create({
      data: { clubId: club.id, socioId: socio.id, cargoIds: [], monto: 1, estado: "RECHAZADO", pasarela: "simulada" },
    });
    const otro = await f.crearClub();
    const ajeno = await f.crearSocio(otro.id);
    await f.crearPagoDirecto(otro.id, ajeno.id, { monto: 99999, fecha: new Date(2026, 9, 5) });

    const c = await cuentaClub(club.id, hoy);
    expect(c).toMatchObject({
      periodo: "2026-10",
      cobrado: 23000,
      cobradoOnline: 15000,
      cobradoVentanilla: 8000,
      deudaPendiente: 8000,
      deudaVencida: 3000,
      intentosSinPago: 1,
    });
    expect(c.acreditaciones.map((p) => [p.monto, p.socio.nombre])).toEqual([
      [8000, "Ana"],
      [15000, "Ana"],
    ]);
  });
});

describe("actualizarConfigClub", () => {
  it("rechaza días fuera de 1..28", async () => {
    // actualizarConfigClub no es async: la validación lanza sincrónicamente.
    await expect((async () => actualizarConfigClub(club.id, { diaVencimiento: 29 }))()).rejects.toBeInstanceOf(ZodError);
  });
});
```

Run: `npx vitest run --project integration tests/integration/cargos.test.ts`
Expected: FAIL — no resuelve `cargos.service`.

- [ ] **Step 4: Implementar cargos y cuenta del club**

Agregar a `src/modules/cuenta-corriente/schema.ts` (y `import { PERIODO_REGEX } from "@/lib/periodo";` y `import { texto } from "@/lib/validation";`):

```ts
export const generarCargosSchema = z.object({
  periodo: z.string().regex(PERIODO_REGEX, "Período con formato YYYY-MM"),
});

export const anularCargoSchema = z.object({
  motivo: texto(200),
});
```

`src/modules/cuenta-corriente/cargos.service.ts`:

```ts
// Cargos de la cuenta corriente: generación por período y anulación.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { periodosGenerables, vencimiento } from "./reglas";
import { anularCargoSchema, generarCargosSchema } from "./schema";

/** Clave de unicidad del cargo de una actividad (el de cuota social usa "CUOTA"). */
export const claveActividad = (actividadId: string) => `ACT:${actividadId}`;

/**
 * Genera la cuota social de cada socio activo y el arancel de cada actividad paga y activa en la
 * que está inscripto. Idempotente (UNIQUE socio+período+clave con skipDuplicates): correrla de
 * nuevo, o en paralelo, no duplica. Pensada para el botón del admin y, más adelante, un cron.
 */
export async function generarCargosPeriodo(clubId: string, input: unknown, hoy: Date = new Date()) {
  const { periodo } = generarCargosSchema.parse(input);
  if (!periodosGenerables(hoy).includes(periodo)) {
    throw new DomainError("Solo se pueden generar cargos del mes actual o del siguiente");
  }
  const club = await db.club.findUnique({ where: { id: clubId }, select: { diaVencimiento: true } });
  if (!club) throw new DomainError("Club no encontrado");
  const vence = vencimiento(periodo, club.diaVencimiento);

  const socios = await db.socio.findMany({
    where: { clubId, activo: true },
    select: {
      id: true,
      tipoSocio: { select: { cuotaMensual: true } },
      inscripciones: {
        where: { actividad: { activa: true, arancel: { gt: 0 } } },
        select: { actividad: { select: { id: true, nombre: true, arancel: true } } },
      },
    },
  });

  const filas: Prisma.CargoCreateManyInput[] = [];
  for (const s of socios) {
    if (s.tipoSocio.cuotaMensual > 0) {
      filas.push({
        clubId, socioId: s.id, concepto: "CUOTA", clave: "CUOTA", descripcion: `Cuota social ${periodo}`,
        periodo, monto: s.tipoSocio.cuotaMensual, vencimiento: vence,
      });
    }
    for (const { actividad: a } of s.inscripciones) {
      filas.push({
        clubId, socioId: s.id, concepto: "ACTIVIDAD", actividadId: a.id, clave: claveActividad(a.id),
        descripcion: `${a.nombre} ${periodo}`, periodo, monto: a.arancel, vencimiento: vence,
      });
    }
  }

  const { count } = filas.length ? await db.cargo.createMany({ data: filas, skipDuplicates: true }) : { count: 0 };
  return { creados: count, existentes: filas.length - count };
}

/** Anula un cargo pendiente (p. ej. generado por error). El cargo queda visible, tachado. */
export async function anularCargo(clubId: string, cargoId: string, input: unknown) {
  const { motivo } = anularCargoSchema.parse(input);
  const { count } = await db.cargo.updateMany({
    where: { id: cargoId, clubId, estado: "PENDIENTE" },
    data: { estado: "ANULADO", motivoAnulacion: motivo },
  });
  if (count === 1) return;
  const existe = await db.cargo.findFirst({ where: { id: cargoId, clubId }, select: { id: true } });
  throw new DomainError(existe ? "Solo se pueden anular cargos pendientes" : "Cargo no encontrado");
}
```

Agregar al final de `src/modules/cuenta-corriente/consultas.service.ts`:

```ts
/** Cuenta del club: lo cobrado en el mes (acreditaciones) y la deuda de los socios. */
export async function cuentaClub(clubId: string, hoy: Date = new Date()) {
  const periodo = periodoActual(hoy);
  const { desde, hasta } = rangoDelMes(periodo);
  const [acreditaciones, pendiente, vencida, intentosSinPago] = await Promise.all([
    db.pago.findMany({
      where: { clubId, fecha: { gte: desde, lt: hasta } },
      orderBy: { fecha: "desc" },
      include: { socio: { select: { nombre: true, apellido: true, nroSocio: true } } },
    }),
    db.cargo.aggregate({ where: { clubId, estado: "PENDIENTE" }, _sum: { monto: true } }),
    db.cargo.aggregate({
      where: { clubId, estado: "PENDIENTE", vencimiento: { lt: inicioDelDia(hoy) } },
      _sum: { monto: true },
    }),
    db.intentoPago.count({ where: { clubId, estado: "APROBADO", pagoId: null } }),
  ]);
  const suma = (ps: { monto: number }[]) => ps.reduce((s, p) => s + p.monto, 0);
  return {
    periodo,
    cobrado: suma(acreditaciones),
    cobradoOnline: suma(acreditaciones.filter((p) => p.medio === "ONLINE")),
    cobradoVentanilla: suma(acreditaciones.filter((p) => p.medio !== "ONLINE")),
    deudaPendiente: pendiente._sum.monto ?? 0,
    deudaVencida: vencida._sum.monto ?? 0,
    acreditaciones,
    intentosSinPago,
  };
}

export type CuentaClubData = Awaited<ReturnType<typeof cuentaClub>>;
```

Run: `npx vitest run --project integration tests/integration/cargos.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Actions, componente y pantallas**

`src/modules/cuenta-corriente/actions.ts`, reemplazo completo:

```ts
"use server";

// Server Actions de cuenta corriente (admin de club). Cada una re-verifica acceso con
// requireClub (los formularios no son una barrera de seguridad).
import { datos, ejecutar, rutaAdmin } from "@/lib/action";
import { requireClub } from "@/lib/session";
import { anularCargo, generarCargosPeriodo } from "./cargos.service";
import { registrarPago } from "./pagos.service";

/** Pago en ventanilla de los cargos tildados (checkboxes "cargoIds"). */
export async function registrarPagoAction(slug: string, socioId: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/socios/${socioId}`, async () => {
    const { club, user } = await requireClub(slug, "admin");
    await registrarPago(club.id, {
      socioId,
      cargoIds: formData.getAll("cargoIds").map(String),
      medio: formData.get("medio"),
      registradoPor: user.id,
    });
    return "Pago registrado";
  });
}

export async function generarCargosAction(slug: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/cuenta`, async () => {
    const { club } = await requireClub(slug, "admin");
    const r = await generarCargosPeriodo(club.id, datos(formData));
    return `Se generaron ${r.creados} cargos (${r.existentes} ya existían)`;
  });
}

export async function anularCargoAction(slug: string, socioId: string, cargoId: string, formData: FormData) {
  await ejecutar(`${rutaAdmin(slug)}/socios/${socioId}`, async () => {
    const { club } = await requireClub(slug, "admin");
    await anularCargo(club.id, cargoId, datos(formData));
    return "Cargo anulado";
  });
}
```

`src/modules/cuenta-corriente/components/CuentaClub.tsx`:

```tsx
import { Card, Stat, Tabla } from "@/components/ui";
import { formatFecha, formatPesos } from "@/lib/format";
import type { CuentaClubData } from "../consultas.service";

/** Cuenta del club (solo presentación): la usan el admin del club y, en lectura, el admin general. */
export function CuentaClub({ cuenta }: { cuenta: CuentaClubData }) {
  return (
    <>
      {cuenta.intentosSinPago > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Intentos aprobados sin pago vinculado ({cuenta.intentosSinPago}): requieren revisión.
        </p>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label={`Cobrado ${cuenta.periodo}`} valor={formatPesos(cuenta.cobrado)} />
        <Stat label="Cobrado online" valor={formatPesos(cuenta.cobradoOnline)} />
        <Stat label="Cobrado en ventanilla" valor={formatPesos(cuenta.cobradoVentanilla)} />
        <Stat label="Deuda pendiente" valor={formatPesos(cuenta.deudaPendiente)} />
        <Stat label="Deuda vencida" valor={formatPesos(cuenta.deudaVencida)} />
      </div>
      <Card title="Acreditaciones del mes">
        {cuenta.acreditaciones.length === 0 ? (
          <p className="text-sm text-slate-500">Sin cobros este mes.</p>
        ) : (
          <Tabla headers={["Fecha", "Socio", "Medio", "Monto"]}>
            {cuenta.acreditaciones.map((p) => (
              <tr key={p.id}>
                <td className="py-2 pr-4">{formatFecha(p.fecha)}</td>
                <td className="py-2 pr-4">
                  N° {p.socio.nroSocio} · {p.socio.apellido}, {p.socio.nombre}
                </td>
                <td className="py-2 pr-4">{p.medio.toLowerCase()}</td>
                <td className="py-2 pr-4">{formatPesos(p.monto)}</td>
              </tr>
            ))}
          </Tabla>
        )}
      </Card>
    </>
  );
}
```

`src/app/c/[slug]/admin/cuenta/page.tsx`:

```tsx
import { requireClub } from "@/lib/session";
import { cuentaClub } from "@/modules/cuenta-corriente/consultas.service";
import { periodosGenerables } from "@/modules/cuenta-corriente/reglas";
import { Aviso, Boton, Card, Selector, Titulo, type SearchParams } from "@/components/ui";
import { generarCargosAction } from "@/modules/cuenta-corriente/actions";
import { CuentaClub } from "@/modules/cuenta-corriente/components/CuentaClub";

export default async function CuentaClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const [cuenta, msg] = await Promise.all([cuentaClub(club.id), searchParams]);
  const [actual, siguiente] = periodosGenerables();

  return (
    <>
      <Titulo sub="Cobros acreditados y deuda de los socios">Cuenta corriente</Titulo>
      <Aviso {...msg} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CuentaClub cuenta={cuenta} />
        </div>
        <Card title="Generar cargos">
          <form action={generarCargosAction.bind(null, slug)} className="flex flex-col gap-3">
            <Selector label="Período" name="periodo" defaultValue={actual}>
              <option value={actual}>{actual} (actual)</option>
              <option value={siguiente}>{siguiente} (siguiente)</option>
            </Selector>
            <p className="text-sm text-slate-500">
              Crea la cuota social de cada socio activo y el arancel de sus actividades. Vencen el día{" "}
              {club.diaVencimiento}. Si ya existen, no se duplican.
            </p>
            <Boton type="submit">Generar cargos</Boton>
          </form>
        </Card>
      </div>
    </>
  );
}
```

`src/app/c/[slug]/admin/layout.tsx`: en `items`, después de `{ href: \`${base}/socios\`, label: "Socios" },` agregar `{ href: \`${base}/cuenta\`, label: "Cuenta corriente" },`.

`src/app/c/[slug]/admin/tipos/page.tsx`, reemplazo completo:

```tsx
import { requireClub } from "@/lib/session";
import { listarTipos } from "@/modules/cuotas/tipos.service";
import { formatPesos } from "@/lib/format";
import { Aviso, Boton, Campo, Card, Tabla, Titulo, type SearchParams } from "@/components/ui";
import { crearTipoAction } from "@/modules/cuotas/actions";
import { actualizarConfigClubAction } from "@/modules/clubs/actions";

export default async function TiposPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const [tipos, msg] = await Promise.all([listarTipos(club.id), searchParams]);

  return (
    <>
      <Titulo sub="Categorías de socio, su cuota mensual y el vencimiento">Tipos de socio</Titulo>
      <Aviso {...msg} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <Tabla headers={["Tipo", "Cuota mensual", "Socios"]}>
              {tipos.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 pr-4 font-medium">{t.nombre}</td>
                  <td className="py-2 pr-4">{formatPesos(t.cuotaMensual)}</td>
                  <td className="py-2 pr-4">{t._count.socios}</td>
                </tr>
              ))}
            </Tabla>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card title="Nuevo tipo">
            <form action={crearTipoAction.bind(null, slug)} className="flex flex-col gap-3">
              <Campo label="Nombre" name="nombre" placeholder="Activo, Cadete, Vitalicio…" required />
              <Campo label="Cuota mensual ($)" name="cuotaMensual" type="number" min={0} required />
              <Boton type="submit">Agregar</Boton>
            </form>
          </Card>
          <Card title="Vencimiento de cuotas">
            <form action={actualizarConfigClubAction.bind(null, slug)} className="flex flex-col gap-3">
              <Campo
                label="Día del mes (1 a 28)"
                name="diaVencimiento"
                type="number"
                min={1}
                max={28}
                defaultValue={club.diaVencimiento}
                required
              />
              <Boton type="submit">Guardar</Boton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
```

`src/app/c/[slug]/admin/socios/[id]/page.tsx`:
- Agregar `Campo` al import de `@/components/ui`, `formatDia` al de `@/lib/format`, y cambiar el import de actions a `import { anularCargoAction, registrarPagoAction } from "@/modules/cuenta-corriente/actions";`.
- Inmediatamente después del cierre `</Card>` de "Cuenta corriente" (dentro del `div` `flex flex-col gap-6 lg:col-span-2`), agregar:

```tsx
          {cuenta.pendientes.length > 0 && (
            <Card title="Anular cargos pendientes">
              <ul className="flex flex-col gap-3">
                {cuenta.pendientes.map((c) => (
                  <li key={c.id}>
                    <form
                      action={anularCargoAction.bind(null, slug, socio.id, c.id)}
                      className="flex flex-wrap items-end gap-3"
                    >
                      <span className="min-w-48 text-sm">
                        {c.descripcion} · {formatPesos(c.monto)} · vence {formatDia(c.vencimiento)}
                      </span>
                      <Campo label="Motivo" name="motivo" required />
                      <Boton variante="peligro">Anular</Boton>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}
```

- [ ] **Step 6: Verificar y commitear**

```bash
npm run typecheck
npm test
git add -A src tests
git commit -m "Agrega generación y anulación de cargos, día de vencimiento y cuenta del club

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: typecheck OK; todos los tests PASS.

---

### Task 5: Aranceles de actividades e inscripción con cargo

**Files:**
- Modify: `src/modules/actividades/schema.ts`, `src/modules/actividades/service.ts`, `src/modules/actividades/actions.ts`
- Modify: `src/modules/cuenta-corriente/cargos.service.ts` (agrega `cargoPorInscripcion`, `anularPorCancelacion`)
- Modify: `src/app/c/[slug]/admin/actividades/page.tsx` (reemplazo completo), `src/app/c/[slug]/socio/page.tsx` (columna Arancel)
- Test: `tests/unit/validation.test.ts`, `tests/integration/inscripcion-cargos.test.ts`

**Interfaces:**
- Consumes: `claveActividad`, `vencimiento`, `periodoActual`.
- Produces:
  - `cargoPorInscripcion(tx, clubId, socioId, actividad: { id: string; nombre: string; arancel: number }, hoy?): Promise<Cargo | null>`
  - `anularPorCancelacion(tx, clubId, socioId, actividadId, hoy?): Promise<void>`
  - `inscribir(clubId, actividadId, socioId, hoy?)`, que ahora devuelve `Inscripcion & { cargo: { id: string; monto: number } | null }`
  - `cancelarInscripcion(clubId, actividadId, socioId, hoy?)`, que ahora corre en una transacción y anula el cargo pendiente del período
  - `actividadSchema` con `arancel` (default 0)

**Ruling sobre el spec:** el spec detecta que "los cargos del período ya se generaron" mirando si el socio tiene su cargo `CUOTA` de ese período. Eso falla para socios con cuota $0, que nunca tienen ese cargo. Por eso se detecta **a nivel club**: existe algún cargo del club en el período actual. El costo es que, si la generación creó cero cargos (club sin socios con deuda), una inscripción posterior tampoco genera cargo. Ese caso lo cubre la siguiente generación.

- [ ] **Step 1: Arancel en el schema (test primero)**

Agregar a `tests/unit/validation.test.ts`, dentro de `describe("actividadSchema", ...)`:

```ts
  it("el arancel es opcional (gratuita), se convierte desde texto y no puede ser negativo", () => {
    expect(actividadSchema.parse({ nombre: "Yoga", diaSemana: 6, hora: "10:00", cupo: 15 }).arancel).toBe(0);
    expect(actividadSchema.parse({ nombre: "Yoga", diaSemana: 6, hora: "10:00", cupo: 15, arancel: "5000" }).arancel).toBe(5000);
    expect(actividadSchema.safeParse({ nombre: "Yoga", diaSemana: 6, hora: "10:00", cupo: 15, arancel: -1 }).success).toBe(false);
  });
```

Run: `npx vitest run tests/unit/validation.test.ts`. Expected: FAIL (`arancel` undefined).

En `src/modules/actividades/schema.ts`, dentro de `actividadSchema`, después de `cupo: entero(1, 500),` agregar:

```ts
  arancel: entero(0, 10_000_000).default(0),
```

Run: `npx vitest run tests/unit/validation.test.ts`. Expected: PASS.

- [ ] **Step 2: Tests de inscripción con cargo (fallan primero)**

`tests/integration/inscripcion-cargos.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Club, Socio, TipoSocio } from "@prisma/client";
import { db } from "@/lib/db";
import { cancelarInscripcion, inscribir } from "@/modules/actividades/service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const hoy = new Date(2026, 9, 15, 12); // período 2026-10
const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

let club: Club;
let tipo: TipoSocio;
let socio: Socio;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub({ diaVencimiento: 10 });
  tipo = await f.crearTipo(club.id, { cuotaMensual: 15000 });
  socio = await f.crearSocio(club.id, { tipoSocioId: tipo.id });
});

/** Simula que el admin ya generó los cargos del período: existe al menos un cargo del club en 2026-10. */
const periodoGenerado = async () => {
  const otro = await f.crearSocio(club.id, { tipoSocioId: tipo.id });
  await f.crearCargo(club.id, otro.id, { periodo: "2026-10", clave: "CUOTA" });
};

const cargoDe = (actividadId: string) =>
  db.cargo.findUnique({ where: { socioId_periodo_clave: { socioId: socio.id, periodo: "2026-10", clave: `ACT:${actividadId}` } } });

describe("inscribirse a una actividad paga", () => {
  it("con el período generado crea el cargo del arancel del mes completo", async () => {
    await periodoGenerado();
    const natacion = await f.crearActividad(club.id, { nombre: "Natación", arancel: 5000 });
    const r = await inscribir(club.id, natacion.id, socio.id, hoy);
    expect(r.cargo?.monto).toBe(5000);
    expect(await cargoDe(natacion.id)).toMatchObject({
      concepto: "ACTIVIDAD",
      descripcion: "Natación 2026-10",
      monto: 5000,
      estado: "PENDIENTE",
      vencimiento: utc(2026, 10, 10),
    });
  });

  it("sin el período generado no crea cargo (lo hará la generación)", async () => {
    const natacion = await f.crearActividad(club.id, { arancel: 5000 });
    const r = await inscribir(club.id, natacion.id, socio.id, hoy);
    expect(r.cargo).toBeNull();
    expect(await db.cargo.count()).toBe(0);
  });

  it("una actividad gratuita no genera cargo", async () => {
    await periodoGenerado();
    const yoga = await f.crearActividad(club.id, { arancel: 0 });
    expect((await inscribir(club.id, yoga.id, socio.id, hoy)).cargo).toBeNull();
  });

  it("un socio con cuota $0 también recibe el cargo del arancel", async () => {
    await periodoGenerado();
    const gratis = await f.crearTipo(club.id, { cuotaMensual: 0 });
    const becado = await f.crearSocio(club.id, { tipoSocioId: gratis.id });
    const natacion = await f.crearActividad(club.id, { arancel: 5000 });
    const r = await inscribir(club.id, natacion.id, becado.id, hoy);
    expect(r.cargo?.monto).toBe(5000);
  });

  it("si falla la creación del cargo, no queda la inscripción", async () => {
    await periodoGenerado();
    await db.club.update({ where: { id: club.id }, data: { diaVencimiento: 31 } }); // inválido a propósito
    const natacion = await f.crearActividad(club.id, { arancel: 5000 });
    await expect(inscribir(club.id, natacion.id, socio.id, hoy)).rejects.toThrow("Día de vencimiento inválido");
    expect(await db.inscripcion.count()).toBe(0);
  });
});

describe("cancelar la inscripción", () => {
  it("anula el cargo del mes si está pendiente", async () => {
    await periodoGenerado();
    const natacion = await f.crearActividad(club.id, { arancel: 5000 });
    await inscribir(club.id, natacion.id, socio.id, hoy);
    await cancelarInscripcion(club.id, natacion.id, socio.id, hoy);
    expect(await cargoDe(natacion.id)).toMatchObject({ estado: "ANULADO", motivoAnulacion: "Baja de actividad" });
  });

  it("si el cargo ya estaba pagado, queda pagado (sin reintegro)", async () => {
    await periodoGenerado();
    const natacion = await f.crearActividad(club.id, { arancel: 5000 });
    await inscribir(club.id, natacion.id, socio.id, hoy);
    await db.cargo.updateMany({ where: { socioId: socio.id }, data: { estado: "PAGADO" } });
    await cancelarInscripcion(club.id, natacion.id, socio.id, hoy);
    expect((await cargoDe(natacion.id))?.estado).toBe("PAGADO");
  });

  it("reinscribirse en el mismo mes reactiva el cargo anulado con el arancel vigente", async () => {
    await periodoGenerado();
    const natacion = await f.crearActividad(club.id, { arancel: 5000 });
    await inscribir(club.id, natacion.id, socio.id, hoy);
    const original = await cargoDe(natacion.id);
    await cancelarInscripcion(club.id, natacion.id, socio.id, hoy);
    await db.actividad.update({ where: { id: natacion.id }, data: { arancel: 6000 } });
    await inscribir(club.id, natacion.id, socio.id, hoy);
    expect(await cargoDe(natacion.id)).toMatchObject({
      id: original!.id,
      estado: "PENDIENTE",
      monto: 6000,
      motivoAnulacion: null,
    });
  });
});
```

Run: `npx vitest run --project integration tests/integration/inscripcion-cargos.test.ts`
Expected: FAIL (`r.cargo` undefined / sin cargos creados).

- [ ] **Step 3: Implementar**

Agregar a `src/modules/cuenta-corriente/cargos.service.ts` (y `import { periodoActual } from "@/lib/periodo";`):

```ts
/**
 * Al inscribirse a una actividad paga: si el club ya generó los cargos del período actual, crea el
 * cargo del arancel del mes completo (sin prorrateo) o reactiva el anulado por una baja anterior.
 * Si todavía no se generaron, no hace nada: lo incluirá la generación. Corre en la transacción
 * de la inscripción: si falla, no hay inscripción.
 */
export async function cargoPorInscripcion(
  tx: Prisma.TransactionClient,
  clubId: string,
  socioId: string,
  actividad: { id: string; nombre: string; arancel: number },
  hoy: Date = new Date(),
) {
  if (actividad.arancel <= 0) return null;
  const periodo = periodoActual(hoy);
  const generado = await tx.cargo.findFirst({ where: { clubId, periodo }, select: { id: true } });
  if (!generado) return null;

  const club = await tx.club.findUniqueOrThrow({ where: { id: clubId }, select: { diaVencimiento: true } });
  const vence = vencimiento(periodo, club.diaVencimiento);
  const clave = claveActividad(actividad.id);
  const existente = await tx.cargo.findUnique({ where: { socioId_periodo_clave: { socioId, periodo, clave } } });
  if (existente?.estado === "ANULADO") {
    return tx.cargo.update({
      where: { id: existente.id },
      data: { estado: "PENDIENTE", monto: actividad.arancel, motivoAnulacion: null },
    });
  }
  if (existente) return null;
  return tx.cargo.create({
    data: {
      clubId, socioId, concepto: "ACTIVIDAD", actividadId: actividad.id, clave,
      descripcion: `${actividad.nombre} ${periodo}`, periodo, monto: actividad.arancel, vencimiento: vence,
    },
  });
}

/** Al cancelar una inscripción: anula el cargo del mes si sigue pendiente (lo pagado no se reintegra). */
export async function anularPorCancelacion(
  tx: Prisma.TransactionClient,
  clubId: string,
  socioId: string,
  actividadId: string,
  hoy: Date = new Date(),
) {
  await tx.cargo.updateMany({
    where: { clubId, socioId, periodo: periodoActual(hoy), clave: claveActividad(actividadId), estado: "PENDIENTE" },
    data: { estado: "ANULADO", motivoAnulacion: "Baja de actividad" },
  });
}
```

En `src/modules/actividades/service.ts`:
- Agregar `import { anularPorCancelacion, cargoPorInscripcion } from "@/modules/cuenta-corriente/cargos.service";`.
- Reemplazar el comentario y la firma de `inscribir`:

```ts
/**
 * Inscribe al socio respetando el cupo y, si la actividad es paga y el período ya se generó,
 * le carga el arancel del mes. La transacción serializable evita que dos inscripciones
 * simultáneas superen el cupo.
 */
export async function inscribir(clubId: string, actividadId: string, socioId: string, hoy: Date = new Date()) {
```

- Dentro de la transacción, reemplazar `return tx.inscripcion.create({ data: { clubId, actividadId, socioId } });` por:

```ts
      const inscripcion = await tx.inscripcion.create({ data: { clubId, actividadId, socioId } });
      const cargo = await cargoPorInscripcion(tx, clubId, socioId, actividad, hoy);
      return { ...inscripcion, cargo: cargo && { id: cargo.id, monto: cargo.monto } };
```

- Reemplazar `cancelarInscripcion` completa por:

```ts
export async function cancelarInscripcion(clubId: string, actividadId: string, socioId: string, hoy: Date = new Date()) {
  await db.$transaction(async (tx) => {
    const { count } = await tx.inscripcion.deleteMany({ where: { clubId, actividadId, socioId } });
    if (count === 0) throw new DomainError("No estabas inscripto");
    await anularPorCancelacion(tx, clubId, socioId, actividadId, hoy);
  });
}
```

En `src/modules/actividades/actions.ts` agregar `import { formatPesos } from "@/lib/format";` y reemplazar `inscribirAction` y `cancelarAction` por:

```ts
export async function inscribirAction(slug: string, actividadId: string) {
  await ejecutar(`/c/${slug}/socio`, async () => {
    const { club, user } = await requireClub(slug, "socio");
    const r = await inscribir(club.id, actividadId, user.socioId!);
    return r.cargo
      ? `Inscripción confirmada. Se agregó el cargo de ${formatPesos(r.cargo.monto)} a tu cuenta`
      : "Inscripción confirmada";
  });
}

export async function cancelarAction(slug: string, actividadId: string) {
  await ejecutar(`/c/${slug}/socio`, async () => {
    const { club, user } = await requireClub(slug, "socio");
    await cancelarInscripcion(club.id, actividadId, user.socioId!);
    return "Inscripción cancelada";
  });
}
```

Run: `npx vitest run --project integration tests/integration/inscripcion-cargos.test.ts tests/integration/actividades.test.ts`
Expected: PASS (8 tests nuevos + los 14 de actividades, incluida la concurrencia).

- [ ] **Step 4: Pantallas**

`src/app/c/[slug]/admin/actividades/page.tsx`, reemplazo completo:

```tsx
import { requireClub } from "@/lib/session";
import { listarActividades } from "@/modules/actividades/service";
import { DIAS, formatPesos } from "@/lib/format";
import { Aviso, Boton, Campo, Card, Selector, Tabla, Titulo, type SearchParams } from "@/components/ui";
import { crearActividadAction } from "@/modules/actividades/actions";

export default async function ActividadesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const [actividades, msg] = await Promise.all([listarActividades(club.id), searchParams]);

  return (
    <>
      <Titulo sub="Calendario semanal con cupos y aranceles">Actividades</Titulo>
      <Aviso {...msg} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <Tabla headers={["Actividad", "Día", "Hora", "Arancel", "Inscriptos / cupo"]}>
              {actividades.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 pr-4 font-medium">{a.nombre}</td>
                  <td className="py-2 pr-4">{DIAS[a.diaSemana]}</td>
                  <td className="py-2 pr-4">{a.hora}</td>
                  <td className="py-2 pr-4">{a.arancel > 0 ? `${formatPesos(a.arancel)}/mes` : "Gratis"}</td>
                  <td className="py-2 pr-4">
                    {a._count.inscripciones} / {a.cupo}
                  </td>
                </tr>
              ))}
            </Tabla>
          </Card>
        </div>
        <Card title="Nueva actividad">
          <form action={crearActividadAction.bind(null, slug)} className="flex flex-col gap-3">
            <Campo label="Nombre" name="nombre" required />
            <Selector label="Día" name="diaSemana" defaultValue="1">
              {DIAS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </Selector>
            <Campo label="Hora" name="hora" type="time" required />
            <Campo label="Cupo" name="cupo" type="number" min={1} required />
            <Campo label="Arancel mensual ($, 0 = gratis)" name="arancel" type="number" min={0} defaultValue={0} />
            <Boton type="submit">Crear</Boton>
          </form>
        </Card>
      </div>
    </>
  );
}
```

`src/app/c/[slug]/socio/page.tsx`: en la tabla de actividades, reemplazar los headers `["Actividad", "Horario", "Cupo", ""]` por `["Actividad", "Horario", "Arancel", "Cupo", ""]` y, después de la celda del horario (`{DIAS[a.diaSemana]} {a.hora}` y su `</td>`), agregar:

```tsx
                    <td className="py-2 pr-4">{a.arancel > 0 ? `${formatPesos(a.arancel)}/mes` : "Gratis"}</td>
```

- [ ] **Step 5: Verificar y commitear**

```bash
npm run typecheck
npm test
git add -A src tests
git commit -m "Agrega aranceles de actividades y cargos al inscribirse o cancelar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Checkout online con la pasarela simulada

**Files:**
- Create: `src/modules/pagos-online/checkout.service.ts`, `src/modules/pagos-online/actions.ts`, `src/app/c/[slug]/socio/pagar/page.tsx`
- Modify: `src/app/c/[slug]/socio/page.tsx` (selección de cargos y botón Pagar)
- Test: `tests/integration/checkout.test.ts`

**Interfaces:**
- Consumes: `getPasarela`, `Pasarela`, `tarjetaSchema`, `TARJETAS_DE_PRUEBA` (Task 2); `registrarPago` (Task 3).
- Produces:
  - `prepararCheckout(clubId, socioId, cargoIds: string[]): Promise<{ cargos: Cargo[]; total: number }>`
  - `pagarOnline(clubId, socioId, cargoIds: string[], datosTarjeta: unknown, pasarela?: Pasarela): Promise<ResultadoCheckout>`
  - `type ResultadoCheckout = { estado: "APROBADO"; intentoId; pagoId } | { estado: "RECHAZADO"; intentoId; motivo } | { estado: "PENDIENTE"; intentoId; redirectUrl? } | { estado: "REQUIERE_REVISION"; intentoId; motivo }`
  - `pagarAction(slug, cargoIds: string[], formData)`

- [ ] **Step 1: Tests (fallan primero)**

`tests/integration/checkout.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Club, Socio } from "@prisma/client";
import { db } from "@/lib/db";
import { registrarPago } from "@/modules/cuenta-corriente/pagos.service";
import { pagarOnline, prepararCheckout } from "@/modules/pagos-online/checkout.service";
import type { Pasarela } from "@/modules/pagos-online/pasarela";
import { pasarelaSimulada } from "@/modules/pagos-online/simulada";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const tarjeta = (numero = "4000 0000 0000 0001") => ({ numero, vencimiento: "12/30", cvv: "123", titular: "Lucía Gómez" });

let club: Club;
let socio: Socio;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
  socio = await f.crearSocio(club.id);
});

describe("prepararCheckout", () => {
  it("devuelve los cargos pendientes elegidos y el total", async () => {
    const c1 = await f.crearCargo(club.id, socio.id, { monto: 15000 });
    const c2 = await f.crearCargo(club.id, socio.id, { monto: 5000 });
    const r = await prepararCheckout(club.id, socio.id, [c1.id, c2.id]);
    expect(r.total).toBe(20000);
    expect(r.cargos).toHaveLength(2);
  });

  it("sin cargos pide elegir al menos uno", async () => {
    await expect(prepararCheckout(club.id, socio.id, [])).rejects.toThrow("Elegí al menos un cargo");
  });

  it("rechaza cargos de otro socio o ya pagados", async () => {
    const otro = await f.crearSocio(club.id);
    const ajeno = await f.crearCargo(club.id, otro.id);
    const pagado = await f.crearCargo(club.id, socio.id, { estado: "PAGADO" });
    await expect(prepararCheckout(club.id, socio.id, [ajeno.id])).rejects.toThrow(
      "Alguno de los cargos ya fue pagado o anulado",
    );
    await expect(prepararCheckout(club.id, socio.id, [pagado.id])).rejects.toThrow(
      "Alguno de los cargos ya fue pagado o anulado",
    );
  });
});

describe("pagarOnline", () => {
  it("aprobado: paga los cargos (ONLINE), vincula el intento y guarda solo los últimos 4 dígitos", async () => {
    const c1 = await f.crearCargo(club.id, socio.id, { monto: 15000 });
    const c2 = await f.crearCargo(club.id, socio.id, { monto: 5000 });
    // `monto` en los datos del formulario se ignora: el total se calcula en el servidor.
    const r = await pagarOnline(club.id, socio.id, [c1.id, c2.id], { ...tarjeta(), monto: "1" }, pasarelaSimulada);
    expect(r.estado).toBe("APROBADO");

    const pago = await db.pago.findFirstOrThrow();
    expect(pago).toMatchObject({ monto: 20000, medio: "ONLINE", registradoPor: null });
    expect(await db.cargo.count({ where: { estado: "PAGADO", pagoId: pago.id } })).toBe(2);
    const intento = await db.intentoPago.findFirstOrThrow();
    expect(intento).toMatchObject({ estado: "APROBADO", pagoId: pago.id, ultimos4: "0001", monto: 20000, pasarela: "simulada" });
    expect(intento.referenciaExterna).toBe(`SIM-${intento.id}`);
  });

  it("rechazado: guarda el intento con el motivo y la deuda queda intacta", async () => {
    const c = await f.crearCargo(club.id, socio.id);
    const r = await pagarOnline(club.id, socio.id, [c.id], tarjeta("4000 0000 0000 0002"), pasarelaSimulada);
    expect(r).toMatchObject({ estado: "RECHAZADO", motivo: "Fondos insuficientes" });
    expect(await db.intentoPago.findFirstOrThrow()).toMatchObject({ estado: "RECHAZADO", motivoRechazo: "Fondos insuficientes", pagoId: null });
    expect((await db.cargo.findUnique({ where: { id: c.id } }))?.estado).toBe("PENDIENTE");
    expect(await db.pago.count()).toBe(0);
  });

  it("si la pasarela falla, el intento queda rechazado por error de la pasarela", async () => {
    const rota: Pasarela = {
      nombre: "rota",
      async cobrar() {
        throw new Error("timeout");
      },
    };
    const c = await f.crearCargo(club.id, socio.id);
    const r = await pagarOnline(club.id, socio.id, [c.id], tarjeta(), rota);
    expect(r).toMatchObject({ estado: "RECHAZADO", motivo: "Error de la pasarela" });
    expect((await db.cargo.findUnique({ where: { id: c.id } }))?.estado).toBe("PENDIENTE");
  });

  it("pendiente (pasarela asincrónica): el intento queda pendiente y la deuda intacta", async () => {
    const asincronica: Pasarela = {
      nombre: "async",
      async cobrar() {
        return { estado: "PENDIENTE", referencia: "PREF-1", redirectUrl: "https://pasarela/pagar" };
      },
    };
    const c = await f.crearCargo(club.id, socio.id);
    const r = await pagarOnline(club.id, socio.id, [c.id], tarjeta(), asincronica);
    expect(r).toMatchObject({ estado: "PENDIENTE", redirectUrl: "https://pasarela/pagar" });
    expect(await db.intentoPago.findFirstOrThrow()).toMatchObject({ estado: "PENDIENTE", referenciaExterna: "PREF-1" });
    expect((await db.cargo.findUnique({ where: { id: c.id } }))?.estado).toBe("PENDIENTE");
  });

  it("aprobado pero el cargo se pagó en ventanilla mientras tanto: intento aprobado sin pago, a revisar", async () => {
    const c = await f.crearCargo(club.id, socio.id);
    const conCarrera: Pasarela = {
      nombre: "carrera",
      async cobrar() {
        await registrarPago(club.id, { socioId: socio.id, cargoIds: [c.id], medio: "EFECTIVO" });
        return { estado: "APROBADO", referencia: "R-1" };
      },
    };
    const r = await pagarOnline(club.id, socio.id, [c.id], tarjeta(), conCarrera);
    expect(r).toMatchObject({ estado: "REQUIERE_REVISION", motivo: "Alguno de los cargos ya fue pagado o anulado" });
    expect(await db.intentoPago.findFirstOrThrow()).toMatchObject({ estado: "APROBADO", pagoId: null, referenciaExterna: "R-1" });
    expect(await db.pago.count()).toBe(1); // solo el de ventanilla
  });

  it("tarjeta inválida: no crea intento", async () => {
    const c = await f.crearCargo(club.id, socio.id);
    await expect(
      pagarOnline(club.id, socio.id, [c.id], { ...tarjeta(), vencimiento: "01/20" }, pasarelaSimulada),
    ).rejects.toBeInstanceOf(ZodError);
    expect(await db.intentoPago.count()).toBe(0);
  });

  it("cargos de otro socio: no crea intento ni cobra", async () => {
    const otro = await f.crearSocio(club.id);
    const ajeno = await f.crearCargo(club.id, otro.id);
    await expect(pagarOnline(club.id, socio.id, [ajeno.id], tarjeta(), pasarelaSimulada)).rejects.toThrow(
      "Alguno de los cargos ya fue pagado o anulado",
    );
    expect(await db.intentoPago.count()).toBe(0);
  });
});
```

Run: `npx vitest run --project integration tests/integration/checkout.test.ts`
Expected: FAIL — no resuelve `checkout.service`.

- [ ] **Step 2: Implementar el checkout**

`src/modules/pagos-online/checkout.service.ts`:

```ts
// Checkout online: valida y cobra cargos pendientes del socio con la pasarela configurada.
import { db } from "@/lib/db";
import { DomainError, mensajeDeError } from "@/lib/errors";
import { registrarPago } from "@/modules/cuenta-corriente/pagos.service";
import { getPasarela } from "./index";
import type { Pasarela, ResultadoPasarela } from "./pasarela";
import { tarjetaSchema } from "./schema";

export type ResultadoCheckout =
  | { estado: "APROBADO"; intentoId: string; pagoId: string }
  | { estado: "RECHAZADO"; intentoId: string; motivo: string }
  | { estado: "PENDIENTE"; intentoId: string; redirectUrl?: string }
  | { estado: "REQUIERE_REVISION"; intentoId: string; motivo: string };

/** Cargos a pagar y su total. Falla si alguno no es del socio o ya no está pendiente. */
export async function prepararCheckout(clubId: string, socioId: string, cargoIds: string[]) {
  const ids = [...new Set(cargoIds.filter(Boolean))];
  if (ids.length === 0) throw new DomainError("Elegí al menos un cargo");
  const cargos = await db.cargo.findMany({
    where: { id: { in: ids }, clubId, socioId, estado: "PENDIENTE" },
    orderBy: { vencimiento: "asc" },
  });
  if (cargos.length !== ids.length) throw new DomainError("Alguno de los cargos ya fue pagado o anulado");
  return { cargos, total: cargos.reduce((s, c) => s + c.monto, 0) };
}

/**
 * Cobra los cargos con la pasarela. El monto se calcula acá (nunca se toma del formulario) y cada
 * intento queda registrado. Si la pasarela aprueba pero los cargos ya no están pendientes (p. ej.
 * se pagaron en ventanilla mientras tanto), el intento queda APROBADO sin pago, para revisión.
 */
export async function pagarOnline(
  clubId: string,
  socioId: string,
  cargoIds: string[],
  datosTarjeta: unknown,
  pasarela: Pasarela = getPasarela(),
): Promise<ResultadoCheckout> {
  const tarjeta = tarjetaSchema.parse(datosTarjeta);
  const { cargos, total } = await prepararCheckout(clubId, socioId, cargoIds);
  const ids = cargos.map((c) => c.id);
  const intento = await db.intentoPago.create({
    data: {
      clubId, socioId, cargoIds: ids, monto: total, estado: "PENDIENTE",
      pasarela: pasarela.nombre, ultimos4: tarjeta.numero.slice(-4),
    },
  });

  let resultado: ResultadoPasarela;
  try {
    resultado = await pasarela.cobrar(
      { intentoId: intento.id, monto: total, descripcion: cargos.map((c) => c.descripcion).join(", ") },
      tarjeta,
    );
  } catch (e) {
    console.error("Error de la pasarela", e);
    await db.intentoPago.update({
      where: { id: intento.id },
      data: { estado: "RECHAZADO", motivoRechazo: "Error de la pasarela" },
    });
    return { estado: "RECHAZADO", intentoId: intento.id, motivo: "Error de la pasarela" };
  }

  if (resultado.estado === "RECHAZADO") {
    await db.intentoPago.update({
      where: { id: intento.id },
      data: { estado: "RECHAZADO", motivoRechazo: resultado.motivo },
    });
    return { estado: "RECHAZADO", intentoId: intento.id, motivo: resultado.motivo };
  }

  if (resultado.estado === "PENDIENTE") {
    await db.intentoPago.update({ where: { id: intento.id }, data: { referenciaExterna: resultado.referencia } });
    return { estado: "PENDIENTE", intentoId: intento.id, redirectUrl: resultado.redirectUrl };
  }

  const referencia = resultado.referencia;
  try {
    const pago = await db.$transaction(async (tx) => {
      const p = await registrarPago(clubId, { socioId, cargoIds: ids, medio: "ONLINE" }, tx);
      await tx.intentoPago.update({
        where: { id: intento.id },
        data: { estado: "APROBADO", referenciaExterna: referencia, pagoId: p.id },
      });
      return p;
    });
    return { estado: "APROBADO", intentoId: intento.id, pagoId: pago.id };
  } catch (e) {
    const motivo = mensajeDeError(e);
    if (motivo === null) console.error("Pago aprobado sin poder registrarse", e);
    await db.intentoPago.update({
      where: { id: intento.id },
      data: { estado: "APROBADO", referenciaExterna: referencia },
    });
    return { estado: "REQUIERE_REVISION", intentoId: intento.id, motivo: motivo ?? "Error al registrar el pago" };
  }
}
```

Run: `npx vitest run --project integration tests/integration/checkout.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 3: Action y pantalla de checkout**

`src/modules/pagos-online/actions.ts`:

```ts
"use server";

// Checkout del socio. El socioId sale de la sesión, nunca del formulario.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { datos } from "@/lib/action";
import { mensajeDeError } from "@/lib/errors";
import { requireClub } from "@/lib/session";
import { pagarOnline } from "./checkout.service";

export async function pagarAction(slug: string, cargoIds: string[], formData: FormData) {
  const { club, user } = await requireClub(slug, "socio");
  const enc = encodeURIComponent;
  const cuenta = `/c/${slug}/socio`;
  const checkout = `${cuenta}/pagar?${cargoIds.map((id) => `cargos=${enc(id)}`).join("&")}`;

  let destino: string;
  try {
    const r = await pagarOnline(club.id, user.socioId!, cargoIds, datos(formData));
    if (r.estado === "APROBADO") destino = `${cuenta}?ok=${enc("Pago aprobado")}`;
    else if (r.estado === "RECHAZADO") destino = `${checkout}&error=${enc(`Pago rechazado: ${r.motivo}`)}`;
    else if (r.estado === "PENDIENTE") destino = r.redirectUrl ?? `${cuenta}?ok=${enc("Pago en proceso")}`;
    else destino = `${cuenta}?error=${enc(`El pago fue aprobado pero no se pudo imputar (${r.motivo}). El club lo va a revisar.`)}`;
  } catch (e) {
    const msg = mensajeDeError(e);
    if (msg === null) throw e;
    destino = `${checkout}&error=${enc(msg)}`;
  }
  revalidatePath(cuenta);
  redirect(destino);
}
```

`src/app/c/[slug]/socio/pagar/page.tsx`:

```tsx
import Link from "next/link";
import { requireClub } from "@/lib/session";
import { mensajeDeError } from "@/lib/errors";
import { formatDia, formatPesos } from "@/lib/format";
import { Aviso, Boton, Campo, Card, Tabla, Titulo } from "@/components/ui";
import { prepararCheckout } from "@/modules/pagos-online/checkout.service";
import { pagarAction } from "@/modules/pagos-online/actions";
import { TARJETAS_DE_PRUEBA } from "@/modules/pagos-online/simulada";

export default async function PagarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cargos?: string | string[]; error?: string }>;
}) {
  const { slug } = await params;
  const { club, user } = await requireClub(slug, "socio");
  const sp = await searchParams;
  const ids = ([] as string[]).concat(sp.cargos ?? []);

  let checkout: Awaited<ReturnType<typeof prepararCheckout>> | null = null;
  let error = sp.error;
  try {
    checkout = await prepararCheckout(club.id, user.socioId!, ids);
  } catch (e) {
    const msg = mensajeDeError(e);
    if (msg === null) throw e;
    error ??= msg;
  }

  return (
    <>
      <p className="mb-1 text-sm font-medium uppercase tracking-wide text-emerald-700">{club.nombre}</p>
      <Titulo sub="Pago online con tarjeta">Pagar</Titulo>
      <Aviso error={error} />
      {checkout ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Detalle">
            <Tabla headers={["Concepto", "Vence", "Monto"]}>
              {checkout.cargos.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-4">{c.descripcion}</td>
                  <td className="py-2 pr-4">{formatDia(c.vencimiento)}</td>
                  <td className="py-2 pr-4">{formatPesos(c.monto)}</td>
                </tr>
              ))}
            </Tabla>
            <p className="mt-4 text-right text-lg font-bold text-slate-900">Total {formatPesos(checkout.total)}</p>
          </Card>
          <Card title="Tarjeta">
            <form action={pagarAction.bind(null, slug, checkout.cargos.map((c) => c.id))} className="flex flex-col gap-3">
              <Campo label="Número" name="numero" inputMode="numeric" placeholder="4000 0000 0000 0001" required />
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Vencimiento (MM/AA)" name="vencimiento" placeholder="12/30" required />
                <Campo label="CVV" name="cvv" inputMode="numeric" required />
              </div>
              <Campo label="Titular" name="titular" required />
              <Boton type="submit">Pagar {formatPesos(checkout.total)}</Boton>
            </form>
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              <p className="font-medium text-slate-700">Modo de prueba</p>
              <ul className="mt-1 list-disc pl-5">
                {TARJETAS_DE_PRUEBA.map((t) => (
                  <li key={t.numero}>
                    <code>{t.numero}</code> — {t.resultado}
                  </li>
                ))}
              </ul>
              <p className="mt-1">Cualquier vencimiento futuro y CVV de 3 dígitos.</p>
            </div>
          </Card>
        </div>
      ) : (
        <Link href={`/c/${slug}/socio`} className="text-emerald-700 underline">
          Volver a mi cuenta
        </Link>
      )}
    </>
  );
}
```

`src/app/c/[slug]/socio/page.tsx`:
- Agregar `import Link from "next/link";` al principio.
- En la card "Mi cuenta", inmediatamente antes de `<p className="mt-2 text-sm text-slate-500">Cuota mensual: ...`, agregar:

```tsx
          {cuenta.pendientes.length > 0 && (
            <Link
              href={`/c/${slug}/socio/pagar?${cuenta.pendientes.map((c) => `cargos=${c.id}`).join("&")}`}
              className="mt-3 inline-block rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Pagar {formatPesos(cuenta.deuda)}
            </Link>
          )}
```

- Reemplazar el contenido de la card "Cuenta corriente" (`<MovimientosTabla movimientos={cuenta.movimientos} />`) por:

```tsx
            <form action={`/c/${slug}/socio/pagar`} method="get" className="flex flex-col gap-4">
              <MovimientosTabla movimientos={cuenta.movimientos} seleccion="cargos" />
              {cuenta.pendientes.length > 0 && (
                <div>
                  <Boton type="submit">Pagar los cargos tildados</Boton>
                </div>
              )}
            </form>
```

- [ ] **Step 4: Verificar y commitear**

```bash
npm run typecheck
npm test
git add -A src tests
git commit -m "Agrega el checkout online con la pasarela simulada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Vista del admin general sobre la cuenta de cada club

**Files:**
- Modify: `src/modules/cuenta-corriente/consultas.service.ts` (agrega `resumenPlataforma`), `src/modules/clubs/service.ts` (agrega `obtenerClubPorSlug`)
- Modify: `src/app/admin/page.tsx` (reemplazo completo)
- Create: `src/app/admin/clubs/[slug]/cuenta/page.tsx`
- Test: `tests/integration/plataforma.test.ts`

**Interfaces:**
- Consumes: `cuentaClub`, `CuentaClub` (Task 4).
- Produces: `resumenPlataforma(hoy?)`, que devuelve `{ periodo, cobradoMes, deudaVencida, sociosMorosos, porClub: Record<clubId, { cobradoMes, deudaVencida }> }`; `obtenerClubPorSlug(slug): Promise<Club | null>`.

- [ ] **Step 1: Test (falla primero)**

`tests/integration/plataforma.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { obtenerClubPorSlug } from "@/modules/clubs/service";
import { resumenPlataforma } from "@/modules/cuenta-corriente/consultas.service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const hoy = new Date(2026, 9, 15, 12);
const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

beforeEach(resetDb);

describe("resumenPlataforma", () => {
  it("consolida lo cobrado en el mes y la deuda vencida por club y en total", async () => {
    const a = await f.crearClub();
    const b = await f.crearClub();
    const sa = await f.crearSocio(a.id);
    const sb = await f.crearSocio(b.id);
    const baja = await f.crearSocio(b.id, { activo: false });
    await f.crearPagoDirecto(a.id, sa.id, { monto: 15000, fecha: new Date(2026, 9, 5) });
    await f.crearPagoDirecto(a.id, sa.id, { monto: 500, fecha: new Date(2026, 8, 5) }); // mes anterior
    await f.crearPagoDirecto(b.id, sb.id, { monto: 8000, fecha: new Date(2026, 9, 6) });
    await f.crearCargo(b.id, sb.id, { monto: 3000, vencimiento: utc(2026, 9, 10) });
    await f.crearCargo(b.id, baja.id, { monto: 2000, vencimiento: utc(2026, 9, 10) });
    await f.crearCargo(a.id, sa.id, { monto: 9000, vencimiento: utc(2026, 10, 20) }); // no vencido

    expect(await resumenPlataforma(hoy)).toEqual({
      periodo: "2026-10",
      cobradoMes: 23000,
      deudaVencida: 5000,
      sociosMorosos: 1,
      porClub: {
        [a.id]: { cobradoMes: 15000, deudaVencida: 0 },
        [b.id]: { cobradoMes: 8000, deudaVencida: 5000 },
      },
    });
  });
});

describe("obtenerClubPorSlug", () => {
  it("encuentra el club o devuelve null", async () => {
    const c = await f.crearClub({ slug: "norte" });
    expect((await obtenerClubPorSlug("norte"))?.id).toBe(c.id);
    expect(await obtenerClubPorSlug("no-existe")).toBeNull();
  });
});
```

Run: `npx vitest run --project integration tests/integration/plataforma.test.ts`
Expected: FAIL (`resumenPlataforma` / `obtenerClubPorSlug` no existen).

- [ ] **Step 2: Implementar**

Agregar al final de `src/modules/cuenta-corriente/consultas.service.ts`:

```ts
/** Consolidado para el admin general: cobrado del mes y deuda vencida, por club y en total. */
export async function resumenPlataforma(hoy: Date = new Date()) {
  const periodo = periodoActual(hoy);
  const { desde, hasta } = rangoDelMes(periodo);
  const vencidoAntesDeHoy = { estado: "PENDIENTE" as const, vencimiento: { lt: inicioDelDia(hoy) } };
  const [cobrado, vencida, sociosMorosos] = await Promise.all([
    db.pago.groupBy({ by: ["clubId"], where: { fecha: { gte: desde, lt: hasta } }, _sum: { monto: true } }),
    db.cargo.groupBy({ by: ["clubId"], where: vencidoAntesDeHoy, _sum: { monto: true } }),
    db.socio.count({ where: { activo: true, cargos: { some: vencidoAntesDeHoy } } }),
  ]);

  const porClub: Record<string, { cobradoMes: number; deudaVencida: number }> = {};
  const de = (clubId: string) => (porClub[clubId] ??= { cobradoMes: 0, deudaVencida: 0 });
  for (const c of cobrado) de(c.clubId).cobradoMes = c._sum.monto ?? 0;
  for (const v of vencida) de(v.clubId).deudaVencida = v._sum.monto ?? 0;
  const total = (k: "cobradoMes" | "deudaVencida") => Object.values(porClub).reduce((s, c) => s + c[k], 0);

  return { periodo, cobradoMes: total("cobradoMes"), deudaVencida: total("deudaVencida"), sociosMorosos, porClub };
}
```

Agregar a `src/modules/clubs/service.ts`:

```ts
export function obtenerClubPorSlug(slug: string) {
  return db.club.findUnique({ where: { slug } });
}
```

Run: `npx vitest run --project integration tests/integration/plataforma.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Pantallas**

`src/app/admin/page.tsx`, reemplazo completo:

```tsx
import Link from "next/link";
import { requireSuperadmin } from "@/lib/session";
import { listarClubs } from "@/modules/clubs/service";
import { resumenPlataforma } from "@/modules/cuenta-corriente/consultas.service";
import { formatPesos } from "@/lib/format";
import { Aviso, Boton, Campo, Card, Stat, Tabla, Titulo, type SearchParams } from "@/components/ui";
import { crearClubAction } from "@/modules/clubs/actions";

export default async function AdminGeneralPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSuperadmin();
  const [clubs, resumen, msg] = await Promise.all([listarClubs(), resumenPlataforma(), searchParams]);

  return (
    <>
      <Titulo sub="Clubes afiliados a la plataforma">Admin general</Titulo>
      <Aviso {...msg} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label={`Cobrado ${resumen.periodo}`} valor={formatPesos(resumen.cobradoMes)} />
        <Stat label="Deuda vencida" valor={formatPesos(resumen.deudaVencida)} />
        <Stat label="Socios morosos" valor={resumen.sociosMorosos} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={`Clubes (${clubs.length})`}>
            <Tabla headers={["Club", "URL", "Administrador", "Socios", "Cobrado del mes", "Deuda vencida", ""]}>
              {clubs.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-4 font-medium">{c.nombre}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/c/${c.slug}/admin`} className="text-emerald-700 underline">
                      /c/{c.slug}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{c.usuarios.map((u) => u.email).join(", ") || "—"}</td>
                  <td className="py-2 pr-4">{c._count.socios}</td>
                  <td className="py-2 pr-4">{formatPesos(resumen.porClub[c.id]?.cobradoMes ?? 0)}</td>
                  <td className="py-2 pr-4">{formatPesos(resumen.porClub[c.id]?.deudaVencida ?? 0)}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/admin/clubs/${c.slug}/cuenta`} className="text-emerald-700 underline">
                      Ver cuenta
                    </Link>
                  </td>
                </tr>
              ))}
            </Tabla>
          </Card>
        </div>
        <Card title="Nuevo club">
          <form action={crearClubAction} className="flex flex-col gap-3">
            <Campo label="Nombre" name="nombre" required />
            <Campo label="Slug (URL)" name="slug" placeholder="club-atletico" required />
            <Campo label="Email del administrador" name="adminEmail" type="email" required />
            <Boton type="submit">Crear club</Boton>
          </form>
        </Card>
      </div>
    </>
  );
}
```

`src/app/admin/clubs/[slug]/cuenta/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/session";
import { obtenerClubPorSlug } from "@/modules/clubs/service";
import { cuentaClub } from "@/modules/cuenta-corriente/consultas.service";
import { Titulo } from "@/components/ui";
import { CuentaClub } from "@/modules/cuenta-corriente/components/CuentaClub";

/** Cuenta del club en solo lectura para el admin general (la plataforma solo observa). */
export default async function CuentaClubAdminGeneralPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireSuperadmin();
  const { slug } = await params;
  const club = await obtenerClubPorSlug(slug);
  if (!club) notFound();
  const cuenta = await cuentaClub(club.id);

  return (
    <>
      <Link href="/admin" className="mb-2 inline-block text-sm text-emerald-700 underline">
        ← Admin general
      </Link>
      <Titulo sub="Cuenta corriente · solo lectura">{club.nombre}</Titulo>
      <CuentaClub cuenta={cuenta} />
    </>
  );
}
```

- [ ] **Step 4: Verificar y commitear**

```bash
npm run typecheck
npm test
git add -A src tests
git commit -m "Agrega la vista del admin general sobre la cuenta de cada club

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Documentación, verificación final y demo

**Files:**
- Modify: `README.md`, `.env.example`

- [ ] **Step 1: Variable de pasarela**

Agregar al final de `.env.example`:

```bash

# Pasarela de pago online: "simulada" (tarjetas de prueba) o "mercadopago" (preparada, sin implementar)
PASARELA="simulada"
```

- [ ] **Step 2: README**

Reemplazar la sección `## Funcionalidades v1` (título y tabla) por:

```markdown
## Funcionalidades

| Rol | Puede |
|---|---|
| Admin general | Crear clubes y asignar su administrador · ver lo cobrado y la deuda vencida de cada club y el consolidado · ver la cuenta de un club en solo lectura |
| Admin de club | Tipos de socio, cuotas y día de vencimiento · alta/modificación/baja de socios · actividades con cupo y arancel mensual · generar los cargos del mes · registrar pagos en ventanilla y anular cargos · cuenta corriente del club · tablero del mes |
| Socio | Ver su cuenta corriente y su estado (al día / con deuda vencida) · pagar cargos online · inscribirse/cancelar actividades (respeta cupo; las pagas suman su arancel) |

### Pagos online (simulados)

El checkout usa la pasarela configurada en `PASARELA` (por defecto `simulada`). Tarjetas de prueba: `4000 0000 0000 0001` (aprobada) y `4000 0000 0000 0002` (rechazada por fondos insuficientes), con cualquier vencimiento futuro y CVV de 3 dígitos. Nunca se guardan el número completo ni el CVV. La integración con Mercado Pago está preparada (`src/modules/pagos-online/mercadopago.ts`) pero no implementada.
```

En `## Estructura`, cambiar la línea de `modules/` por:

```
  modules/         un módulo por dominio: clubs, cuotas, socios, actividades, cuenta-corriente, pagos-online
```

- [ ] **Step 3: Verificación completa**

```bash
npm run typecheck && npm run test:unit && npm run test:int && npm run build
npx prisma migrate status
npm run db:seed
```

Expected: todo en verde; `migrate status` "Database schema is up to date!"; seed OK.

- [ ] **Step 4: Commit**

```bash
git add README.md .env.example
git commit -m "Documenta la cuenta corriente y los pagos simulados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Checkpoint humano — flujo de demo (criterio de aceptación del spec)**

Levantar `npm run dev` y pedirle a la persona que recorra, con `DEMO_LOGIN=true`:

1. `admin@demo.club`, Cuenta corriente: genera los cargos del mes. Como ya existen por el seed, ve "Se generaron 0 cargos (N ya existían)". Si genera el mes siguiente, se crean los cargos nuevos.
2. `socio@demo.club`: ve su deuda (cuota + Natación del mes) y paga con `4000 0000 0000 0002`. Resultado esperado: "Pago rechazado: Fondos insuficientes" y la deuda intacta.
3. Paga con `4000 0000 0000 0001`. Resultado esperado: "Pago aprobado" y su estado pasa a "Al día".
4. `admin@demo.club`: ve la acreditación online en la cuenta del club.
5. El socio se inscribe a Fútbol infantil (paga): aparece el cargo de $6.000. Cancela: el cargo queda anulado.
6. `admin@gestiondesocios.com`: ve lo cobrado por el club en el consolidado y en "Ver cuenta".

Recordatorio para la persona: antes de pushear a `main` hay que resetear Neon desde las migraciones, que ahora son dos (`0_init` y `cuenta_corriente`), y cargar `DIRECT_URL` y `PASARELA` en Vercel.
