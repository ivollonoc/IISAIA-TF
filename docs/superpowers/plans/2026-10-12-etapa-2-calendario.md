# Etapa 2 — Calendario de actividades: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que admin y socios vean las clases reales de cada semana y mes a partir de la regla semanal de cada actividad, con sus suspensiones y reprogramaciones, y los eventos puntuales del club.

**Architecture:** Módulo nuevo `src/modules/calendario`:
- las clases se calculan al vuelo con funciones puras (`reglas.ts`);
- solo se guardan las excepciones (`ExcepcionClase`) y los eventos (`Evento`);
- el servicio arma el calendario por rango para el admin y para el socio, y ofrece las operaciones del admin;
- la UI es una grilla mensual y una agenda sin JavaScript de cliente.

Los helpers de fecha que hoy viven en `cuenta-corriente/reglas.ts` pasan a `src/lib/periodo.ts`, para que ambos módulos los compartan.

**Tech Stack:** Next.js 15 (App Router, Server Actions) · React 19 · TypeScript · Prisma 6.19 · PostgreSQL 16 · Zod 3 · Vitest 3.2 · Node 22.

**Spec:** `docs/superpowers/specs/2026-10-12-etapa-2-calendario-design.md` (roadmap: `docs/superpowers/specs/2026-10-12-roadmap-v2-design.md`). Se construye sobre `mvp2`, que ya tiene las etapas 0 y 1.

## Global Constraints

- Rama `mvp2`. Commits locales, **sin push**. Mensajes en español, en tercera persona ("Agrega…"), terminados con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Node 22: anteponer `source ~/.nvm/nvm.sh >/dev/null && nvm use 22 >/dev/null &&` a cada comando npm o npx.
- Sin dependencias npm nuevas (sin librería de calendario).
- Días a medianoche UTC del calendario de Argentina (`fechaLocal`/`inicioDelDia`). Horas `"HH:MM"` en hora local. El día de la semana de una fecha guardada se obtiene con `getUTCDay()`.
- Un módulo importa de otro solo a través de `service.ts` o `schema.ts`. Los helpers de fecha compartidos viven en `src/lib/periodo.ts`.
- Servicios: `clubId` como primer parámetro y como filtro de toda consulta.
- Estética: componentes de `src/components/ui.tsx` y la paleta actual (esmeralda/slate; ámbar y rojo solo para estados). Sin JavaScript de cliente.
- Rango máximo por consulta de calendario: **42 días**. Error: "El rango máximo es de 6 semanas".
- Migraciones: el agente **no** corre `prisma migrate reset` ni `migrate dev`. La migración se genera con `prisma migrate diff --from-schema-datasource` contra la base local (que está en `cuenta_corriente`) y se aplica con `npm run db:deploy`.
- Los tests de unidad deben pasar también con `TZ=UTC`.
- Puede haber un `npm run dev` corriendo en el puerto 3000. Detenerlo antes de la Task 3 y no correr `next build` mientras esté activo.

## Review Focus

1. **Bordes de día por zona horaria.** Una actividad creada a las 23 h de Argentina (ya "mañana" en UTC) tiene que incluir la clase de ese día. → test en Task 2 (`clasesEnRango`).
2. **URL del admin manipulada** (`?clase=` con una actividad de otro club, una fecha que no es de la regla o un formato inválido). El panel no aparece, sin error 500. → test de `obtenerClase` en Task 4.
3. **`?mes=` inválido o ausente.** Se muestra el mes actual. → test de `mesDeParam` en Task 2.
4. **Fecha inexistente en un formulario** (por ejemplo `2026-02-31`). Error de validación, nunca una fecha "corrida" al mes siguiente. → test de `parsearDia` en Task 2.
5. **Acciones que vuelven a una ruta con `?mes=`.** El mensaje de resultado y la revalidación funcionan (la URL no termina con dos `?`). → test de `ejecutar` en Task 1.

---

### Task 1: Helpers de fecha compartidos, formatos y `ejecutar` con rutas con query

**Files:**
- Modify: `src/lib/periodo.ts` (agrega `inicioDelDia`, `periodoSiguiente`, `periodoAnterior`, `DIA_MS`)
- Modify: `src/modules/cuenta-corriente/reglas.ts` (los re-exporta desde `@/lib/periodo`)
- Modify: `src/lib/format.ts` (agrega `formatDiaCorto`, `nombreMes`)
- Modify: `src/lib/action.ts` (`ejecutar` respeta una `?` existente en la ruta)
- Test: `tests/unit/periodo.test.ts`, `tests/unit/format.test.ts`, `tests/unit/action.test.ts`

**Interfaces:**
- Produces:
  - `DIA_MS = 86_400_000`
  - `inicioDelDia(fecha?: Date): Date`, `periodoSiguiente(p: string): string` y `periodoAnterior(p: string): string`, exportados desde `@/lib/periodo` (y re-exportados desde `@/modules/cuenta-corriente/reglas`, sin cambios para quien ya los usa)
  - `formatDiaCorto(fecha: Date): string`, que devuelve, por ejemplo, `"Mié 14/10"` (calculado en UTC)
  - `nombreMes(periodo: string): string`, que devuelve, por ejemplo, `"octubre 2026"`
  - `ejecutar(ruta, fn)`: si `ruta` ya tiene `?`, agrega el aviso con `&` y revalida solo el path

- [ ] **Step 1: Tests (fallan primero)**

Agregar al final de `tests/unit/periodo.test.ts` (y sumar `DIA_MS, inicioDelDia, periodoAnterior, periodoSiguiente` al import de `@/lib/periodo`):

```ts
describe("helpers de días compartidos", () => {
  it("inicioDelDia es la medianoche UTC del día calendario de Argentina", () => {
    // 14/10/2026 23:00 en Argentina = 15/10/2026 02:00 UTC
    expect(inicioDelDia(new Date(Date.UTC(2026, 9, 15, 2)))).toEqual(new Date(Date.UTC(2026, 9, 14)));
  });

  it("periodoSiguiente y periodoAnterior cruzan el año", () => {
    expect(periodoSiguiente("2026-12")).toBe("2027-01");
    expect(periodoAnterior("2027-01")).toBe("2026-12");
  });

  it("DIA_MS es un día en milisegundos", () => {
    expect(DIA_MS).toBe(24 * 60 * 60 * 1000);
  });
});
```

Agregar al final de `tests/unit/format.test.ts` (y sumar `formatDiaCorto, nombreMes` al import de `@/lib/format`):

```ts
describe("formatDiaCorto y nombreMes", () => {
  it("muestra día de la semana y fecha de un día guardado a medianoche UTC", () => {
    expect(formatDiaCorto(new Date(Date.UTC(2026, 9, 14)))).toBe("Mié 14/10");
    expect(formatDiaCorto(new Date(Date.UTC(2026, 10, 1)))).toBe("Dom 01/11");
  });

  it("nombra el mes de un período", () => {
    expect(nombreMes("2026-10")).toBe("octubre 2026");
    expect(nombreMes("2027-01")).toBe("enero 2027");
  });
});
```

Agregar dentro del `describe("ejecutar", ...)` de `tests/unit/action.test.ts`:

```ts
  it("si la ruta ya tiene parámetros, agrega el aviso con & y revalida solo el path", async () => {
    const { revalidatePath } = await import("next/cache");
    await expect(ejecutar("/c/demo/admin/calendario?mes=2026-10", async () => "Clase suspendida")).rejects.toThrow(
      /^REDIRECT:\/c\/demo\/admin\/calendario\?mes=2026-10&ok=Clase%20suspendida&f=[\w-]+$/,
    );
    expect(revalidatePath).toHaveBeenLastCalledWith("/c/demo/admin/calendario");
  });
```

Run: `npx vitest run tests/unit/periodo.test.ts tests/unit/format.test.ts tests/unit/action.test.ts`
Expected: FAIL (`inicioDelDia`/`formatDiaCorto` no exportados; el test de `ejecutar` recibe `?mes=2026-10?ok=`).

- [ ] **Step 2: Implementar**

Agregar al final de `src/lib/periodo.ts`:

```ts
export const DIA_MS = 86_400_000;

/** Medianoche UTC del día calendario de `fecha` en Argentina: así se guardan y comparan los días. */
export function inicioDelDia(fecha: Date = new Date()): Date {
  const { anio, mes, dia } = fechaLocal(fecha);
  return new Date(Date.UTC(anio, mes - 1, dia));
}

export function periodoSiguiente(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  return mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, "0")}`;
}

export function periodoAnterior(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  return mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, "0")}`;
}
```

En `src/modules/cuenta-corriente/reglas.ts`:
- Borrar las funciones `inicioDelDia`, `periodoSiguiente` y `periodoAnterior`, con sus comentarios.
- Cambiar el import de `@/lib/periodo` a:

```ts
import { inicioDelDia, OFFSET_UTC_HORAS, PERIODO_REGEX, periodoActual, periodoSiguiente } from "@/lib/periodo";

// Helpers de días compartidos con otros módulos (viven en lib/periodo).
export { inicioDelDia, periodoAnterior, periodoSiguiente } from "@/lib/periodo";
```

(Si `fechaLocal` deja de usarse en `reglas.ts`, quitarlo del import.)

Agregar al final de `src/lib/format.ts`:

```ts
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const dos = (n: number) => String(n).padStart(2, "0");

/** "Mié 14/10" para un día guardado a medianoche UTC. */
export const formatDiaCorto = (fecha: Date) =>
  `${DIAS_CORTOS[fecha.getUTCDay()]} ${dos(fecha.getUTCDate())}/${dos(fecha.getUTCMonth() + 1)}`;

/** "octubre 2026" para un período "YYYY-MM". */
export const nombreMes = (periodo: string) => {
  const [anio, mes] = periodo.split("-").map(Number);
  return `${MESES[mes - 1]} ${anio}`;
};
```

En `src/lib/action.ts`, dentro de `ejecutar`, reemplazar:

```ts
  revalidatePath(ruta);
  redirect(`${ruta}?${error ? queryAviso("error", error) : queryAviso("ok", ok)}`);
```

por:

```ts
  revalidatePath(ruta.split("?")[0]);
  const separador = ruta.includes("?") ? "&" : "?";
  redirect(`${ruta}${separador}${error ? queryAviso("error", error) : queryAviso("ok", ok)}`);
```

Run: `npx vitest run tests/unit` y `TZ=UTC npx vitest run tests/unit`
Expected: PASS en las dos corridas.

- [ ] **Step 3: Verificar y commitear**

```bash
npm run typecheck
npm test
git add src/lib src/modules/cuenta-corriente/reglas.ts tests/unit
git commit -m "Comparte helpers de días en lib/periodo, agrega formatos de calendario y rutas con query en ejecutar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Reglas puras del calendario

**Files:**
- Create: `src/modules/calendario/reglas.ts`, `src/modules/calendario/components/etiquetas.ts`
- Test: `tests/unit/calendario-reglas.test.ts`

**Interfaces:**
- Consumes: `DIA_MS`, `inicioDelDia`, `PERIODO_REGEX`, `periodoActual` (`@/lib/periodo`); `formatDiaCorto` (`@/lib/format`).
- Produces:
  - `parsearDia(texto: string): Date | null` y `claveDia(fecha: Date): string` (`"YYYY-MM-DD"`)
  - `mesDeParam(param: string | undefined, hoy?: Date): string`
  - `clasesEnRango(actividad: { diaSemana: number; createdAt: Date }, desde: Date, hasta: Date): Date[]` (rango inclusivo)
  - `horaFin(hora: string, duracionMin: number): string`
  - `type EstadoItem = "NORMAL" | "SUSPENDIDA" | "MOVIDA" | "REPROGRAMADA"`, `interface ItemCalendario` (spec)
  - `interface ActividadCalendario { id; nombre; diaSemana; hora; duracionMin; activa; createdAt }`, `interface ExcepcionCalendario { id; actividadId; fecha; tipo: "SUSPENDIDA" | "REPROGRAMADA"; nuevaFecha: Date | null; nuevaHora: string | null; motivo }`, `interface EventoCalendario { id; titulo; fecha; hora; lugar: string | null; descripcion: string | null; actividadId: string | null }`
  - `armarCalendario({ actividades, excepciones, eventos, desde, hasta }): ItemCalendario[]`
  - `semanasDelMes(periodo: string): Date[][]`
  - `etiquetaItem(item): string` y `detalleItem(item): string` (texto corto para la grilla y texto completo para la agenda)

- [ ] **Step 1: Tests (fallan primero)**

`tests/unit/calendario-reglas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  armarCalendario,
  clasesEnRango,
  claveDia,
  horaFin,
  mesDeParam,
  parsearDia,
  semanasDelMes,
  type ActividadCalendario,
  type EventoCalendario,
  type ExcepcionCalendario,
} from "@/modules/calendario/reglas";
import { detalleItem, etiquetaItem } from "@/modules/calendario/components/etiquetas";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const desdeSiempre = dia(2026, 1, 1);

describe("parsearDia / claveDia / mesDeParam", () => {
  it("convierte AAAA-MM-DD a medianoche UTC y vuelve", () => {
    expect(parsearDia("2026-10-14")).toEqual(dia(2026, 10, 14));
    expect(claveDia(dia(2026, 10, 14))).toBe("2026-10-14");
  });

  it("rechaza fechas inexistentes o mal formadas (no las corre de mes)", () => {
    expect(parsearDia("2026-02-31")).toBeNull();
    expect(parsearDia("2026-13-01")).toBeNull();
    expect(parsearDia("14/10/2026")).toBeNull();
    expect(parsearDia("")).toBeNull();
  });

  it("mesDeParam usa el mes pedido si es válido y si no el actual", () => {
    const hoy = new Date(Date.UTC(2026, 9, 15, 15));
    expect(mesDeParam("2026-11", hoy)).toBe("2026-11");
    expect(mesDeParam("2026-13", hoy)).toBe("2026-10");
    expect(mesDeParam(undefined, hoy)).toBe("2026-10");
  });
});

describe("clasesEnRango", () => {
  it("devuelve los miércoles de octubre de 2026", () => {
    expect(clasesEnRango({ diaSemana: 3, createdAt: desdeSiempre }, dia(2026, 10, 1), dia(2026, 10, 31))).toEqual([
      dia(2026, 10, 7),
      dia(2026, 10, 14),
      dia(2026, 10, 21),
      dia(2026, 10, 28),
    ]);
  });

  it("cruza de mes", () => {
    expect(clasesEnRango({ diaSemana: 1, createdAt: desdeSiempre }, dia(2026, 10, 26), dia(2026, 11, 9))).toEqual([
      dia(2026, 10, 26),
      dia(2026, 11, 2),
      dia(2026, 11, 9),
    ]);
  });

  it("no incluye clases anteriores a la creación de la actividad", () => {
    const creada = new Date(Date.UTC(2026, 9, 15, 15)); // jueves 15/10 12:00 en Argentina
    expect(clasesEnRango({ diaSemana: 3, createdAt: creada }, dia(2026, 10, 1), dia(2026, 10, 31))).toEqual([
      dia(2026, 10, 21),
      dia(2026, 10, 28),
    ]);
  });

  it("una actividad creada a las 23 h de Argentina incluye la clase de ese día", () => {
    const creada = new Date(Date.UTC(2026, 9, 15, 2)); // miércoles 14/10 23:00 en Argentina
    expect(clasesEnRango({ diaSemana: 3, createdAt: creada }, dia(2026, 10, 1), dia(2026, 10, 31))[0]).toEqual(
      dia(2026, 10, 14),
    );
  });

  it("los domingos son diaSemana 0", () => {
    expect(clasesEnRango({ diaSemana: 0, createdAt: desdeSiempre }, dia(2026, 10, 1), dia(2026, 10, 31))).toEqual([
      dia(2026, 10, 4),
      dia(2026, 10, 11),
      dia(2026, 10, 18),
      dia(2026, 10, 25),
    ]);
  });
});

describe("horaFin", () => {
  it("suma la duración, incluso pasando de medianoche", () => {
    expect(horaFin("18:00", 60)).toBe("19:00");
    expect(horaFin("09:15", 45)).toBe("10:00");
    expect(horaFin("23:30", 60)).toBe("00:30");
  });
});

describe("armarCalendario", () => {
  const natacion: ActividadCalendario = {
    id: "nat", nombre: "Natación", diaSemana: 3, hora: "19:00", duracionMin: 60, activa: true, createdAt: desdeSiempre,
  };
  const yoga: ActividadCalendario = {
    id: "yoga", nombre: "Yoga", diaSemana: 6, hora: "10:00", duracionMin: 90, activa: false, createdAt: desdeSiempre,
  };
  const semana = { desde: dia(2026, 10, 12), hasta: dia(2026, 10, 18) };
  const reprogramada: ExcepcionCalendario = {
    id: "e2", actividadId: "nat", fecha: dia(2026, 10, 14), tipo: "REPROGRAMADA",
    nuevaFecha: dia(2026, 10, 16), nuevaHora: "20:00", motivo: "Pileta en mantenimiento",
  };

  it("arma la clase normal con su hora de fin y excluye actividades inactivas", () => {
    const items = armarCalendario({ actividades: [natacion, yoga], excepciones: [], eventos: [], ...semana });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      tipo: "CLASE", fecha: dia(2026, 10, 14), hora: "19:00", horaFin: "20:00",
      titulo: "Natación", estado: "NORMAL", actividadId: "nat",
    });
  });

  it("marca la clase suspendida con su motivo", () => {
    const suspension: ExcepcionCalendario = {
      id: "e1", actividadId: "nat", fecha: dia(2026, 10, 14), tipo: "SUSPENDIDA",
      nuevaFecha: null, nuevaHora: null, motivo: "Feriado",
    };
    const [item] = armarCalendario({ actividades: [natacion], excepciones: [suspension], eventos: [], ...semana });
    expect(item).toMatchObject({ estado: "SUSPENDIDA", motivo: "Feriado", excepcionId: "e1" });
  });

  it("una reprogramada aparece como MOVIDA en la fecha original y REPROGRAMADA en la nueva", () => {
    const items = armarCalendario({ actividades: [natacion], excepciones: [reprogramada], eventos: [], ...semana });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      estado: "MOVIDA", fecha: dia(2026, 10, 14), destino: { fecha: dia(2026, 10, 16), hora: "20:00" },
    });
    expect(items[1]).toMatchObject({
      estado: "REPROGRAMADA", fecha: dia(2026, 10, 16), hora: "20:00", horaFin: "21:00",
      fechaOriginal: dia(2026, 10, 14), motivo: "Pileta en mantenimiento",
    });
  });

  it("si solo una de las dos fechas cae en el rango, muestra solo esa", () => {
    const soloNueva = armarCalendario({
      actividades: [natacion], excepciones: [reprogramada], eventos: [], desde: dia(2026, 10, 15), hasta: dia(2026, 10, 18),
    });
    expect(soloNueva.map((i) => i.estado)).toEqual(["REPROGRAMADA"]);
    const soloOriginal = armarCalendario({
      actividades: [natacion], excepciones: [reprogramada], eventos: [], desde: dia(2026, 10, 12), hasta: dia(2026, 10, 15),
    });
    expect(soloOriginal.map((i) => i.estado)).toEqual(["MOVIDA"]);
  });

  it("incluye los eventos del rango y ordena por fecha y hora", () => {
    const eventos: EventoCalendario[] = [
      { id: "ev1", titulo: "Asamblea", fecha: dia(2026, 10, 14), hora: "18:00", lugar: "Sede", descripcion: null, actividadId: null },
      { id: "ev2", titulo: "Fuera de rango", fecha: dia(2026, 10, 25), hora: "10:00", lugar: null, descripcion: null, actividadId: null },
    ];
    const items = armarCalendario({ actividades: [natacion], excepciones: [], eventos, ...semana });
    expect(items.map((i) => [i.tipo, i.titulo, i.hora])).toEqual([
      ["EVENTO", "Asamblea", "18:00"],
      ["CLASE", "Natación", "19:00"],
    ]);
    expect(items[0]).toMatchObject({ estado: "NORMAL", eventoId: "ev1", lugar: "Sede" });
  });
});

describe("semanasDelMes", () => {
  const resumen = (periodo: string) => {
    const semanas = semanasDelMes(periodo);
    return {
      semanas: semanas.length,
      primero: claveDia(semanas[0][0]),
      ultimo: claveDia(semanas.at(-1)![6]),
      todasDeLunesADomingo: semanas.every((s) => s.length === 7 && s[0].getUTCDay() === 1 && s[6].getUTCDay() === 0),
    };
  };

  it("octubre 2026 empieza en jueves: la grilla arranca el lunes 28/9 y tiene 5 semanas", () => {
    expect(resumen("2026-10")).toEqual({ semanas: 5, primero: "2026-09-28", ultimo: "2026-11-01", todasDeLunesADomingo: true });
  });

  it("noviembre 2026 ocupa 6 semanas", () => {
    expect(resumen("2026-11")).toEqual({ semanas: 6, primero: "2026-10-26", ultimo: "2026-12-06", todasDeLunesADomingo: true });
  });

  it("febrero 2027 ocupa exactamente 4 semanas", () => {
    expect(resumen("2027-02")).toEqual({ semanas: 4, primero: "2027-02-01", ultimo: "2027-02-28", todasDeLunesADomingo: true });
  });
});

describe("etiquetas", () => {
  const base = { tipo: "CLASE" as const, fecha: dia(2026, 10, 14), hora: "19:00", horaFin: "20:00", titulo: "Natación" };

  it("texto corto para la grilla", () => {
    expect(etiquetaItem({ ...base, estado: "NORMAL" })).toBe("19:00 Natación");
    expect(etiquetaItem({ ...base, estado: "SUSPENDIDA", motivo: "Feriado" })).toBe("19:00 Natación (suspendida)");
    expect(
      etiquetaItem({ ...base, estado: "MOVIDA", motivo: "Lluvia", destino: { fecha: dia(2026, 10, 16), hora: "20:00" } }),
    ).toBe("19:00 Natación → Vie 16/10 20:00");
    expect(
      etiquetaItem({ ...base, fecha: dia(2026, 10, 16), hora: "20:00", horaFin: "21:00", estado: "REPROGRAMADA", fechaOriginal: dia(2026, 10, 14) }),
    ).toBe("20:00 Natación (reprogramada)");
  });

  it("texto completo para la agenda", () => {
    expect(detalleItem({ ...base, estado: "NORMAL" })).toBe("19:00–20:00 Natación");
    expect(detalleItem({ ...base, estado: "SUSPENDIDA", motivo: "Feriado" })).toBe("19:00–20:00 Natación · Suspendida: Feriado");
    expect(
      detalleItem({ ...base, estado: "MOVIDA", motivo: "Lluvia", destino: { fecha: dia(2026, 10, 16), hora: "20:00" } }),
    ).toBe("19:00–20:00 Natación · Reprogramada al Vie 16/10 20:00: Lluvia");
    expect(
      detalleItem({
        ...base, fecha: dia(2026, 10, 16), hora: "20:00", horaFin: "21:00",
        estado: "REPROGRAMADA", motivo: "Lluvia", fechaOriginal: dia(2026, 10, 14),
      }),
    ).toBe("20:00–21:00 Natación · Reprogramada desde Mié 14/10: Lluvia");
    expect(
      detalleItem({ tipo: "EVENTO", fecha: dia(2026, 10, 14), hora: "18:00", titulo: "Asamblea", estado: "NORMAL", lugar: "Sede" }),
    ).toBe("18:00 Asamblea · Sede");
  });
});
```

Run: `npx vitest run tests/unit/calendario-reglas.test.ts`
Expected: FAIL (no resuelve `@/modules/calendario/reglas`).

- [ ] **Step 2: Implementar**

`src/modules/calendario/reglas.ts`:

```ts
// Reglas puras del calendario (sin I/O). Los días son fechas a medianoche UTC del calendario
// de Argentina; el día de la semana se lee con getUTCDay(). Las horas son "HH:MM" locales.
import { DIA_MS, inicioDelDia, PERIODO_REGEX, periodoActual } from "@/lib/periodo";

export type EstadoItem = "NORMAL" | "SUSPENDIDA" | "MOVIDA" | "REPROGRAMADA";

export interface ItemCalendario {
  tipo: "CLASE" | "EVENTO";
  fecha: Date;
  hora: string;
  horaFin?: string;
  titulo: string;
  estado: EstadoItem;
  motivo?: string;
  fechaOriginal?: Date;
  destino?: { fecha: Date; hora: string };
  actividadId?: string;
  excepcionId?: string;
  eventoId?: string;
  lugar?: string;
  descripcion?: string;
}

export interface ActividadCalendario {
  id: string;
  nombre: string;
  diaSemana: number;
  hora: string;
  duracionMin: number;
  activa: boolean;
  createdAt: Date;
}

export interface ExcepcionCalendario {
  id: string;
  actividadId: string;
  fecha: Date;
  tipo: "SUSPENDIDA" | "REPROGRAMADA";
  nuevaFecha: Date | null;
  nuevaHora: string | null;
  motivo: string;
}

export interface EventoCalendario {
  id: string;
  titulo: string;
  fecha: Date;
  hora: string;
  lugar: string | null;
  descripcion: string | null;
  actividadId: string | null;
}

/** "AAAA-MM-DD" → medianoche UTC; null si el formato es inválido o la fecha no existe. */
export function parsearDia(texto: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const fecha = new Date(`${texto}T00:00:00Z`);
  return Number.isNaN(fecha.getTime()) || claveDia(fecha) !== texto ? null : fecha;
}

export const claveDia = (fecha: Date) => fecha.toISOString().slice(0, 10);

/** Mes a mostrar: el del parámetro ?mes=YYYY-MM si es válido; si no, el actual. */
export function mesDeParam(param: string | undefined, hoy: Date = new Date()): string {
  return param && PERIODO_REGEX.test(param) ? param : periodoActual(hoy);
}

/** Fechas de la regla semanal dentro de [desde, hasta], sin clases anteriores a la creación. */
export function clasesEnRango(actividad: { diaSemana: number; createdAt: Date }, desde: Date, hasta: Date): Date[] {
  const inicio = Math.max(desde.getTime(), inicioDelDia(actividad.createdAt).getTime());
  const fechas: Date[] = [];
  for (let t = inicio; t <= hasta.getTime(); t += DIA_MS) {
    const fecha = new Date(t);
    if (fecha.getUTCDay() === actividad.diaSemana) fechas.push(fecha);
  }
  return fechas;
}

/** Hora de fin "HH:MM" (da la vuelta a medianoche). */
export function horaFin(hora: string, duracionMin: number): string {
  const [h, m] = hora.split(":").map(Number);
  const total = (h * 60 + m + duracionMin) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Clases de la regla con sus excepciones, más los eventos, ordenados por fecha y hora. */
export function armarCalendario({
  actividades,
  excepciones,
  eventos,
  desde,
  hasta,
}: {
  actividades: ActividadCalendario[];
  excepciones: ExcepcionCalendario[];
  eventos: EventoCalendario[];
  desde: Date;
  hasta: Date;
}): ItemCalendario[] {
  const enRango = (f: Date) => f.getTime() >= desde.getTime() && f.getTime() <= hasta.getTime();
  const activas = new Map(actividades.filter((a) => a.activa).map((a) => [a.id, a]));
  const porClase = new Map(excepciones.map((e) => [`${e.actividadId}|${claveDia(e.fecha)}`, e]));
  const items: ItemCalendario[] = [];

  for (const a of activas.values()) {
    for (const fecha of clasesEnRango(a, desde, hasta)) {
      const base = {
        tipo: "CLASE" as const, fecha, hora: a.hora, horaFin: horaFin(a.hora, a.duracionMin),
        titulo: a.nombre, actividadId: a.id,
      };
      const exc = porClase.get(`${a.id}|${claveDia(fecha)}`);
      if (!exc) items.push({ ...base, estado: "NORMAL" });
      else if (exc.tipo === "SUSPENDIDA") items.push({ ...base, estado: "SUSPENDIDA", motivo: exc.motivo, excepcionId: exc.id });
      else
        items.push({
          ...base, estado: "MOVIDA", motivo: exc.motivo, excepcionId: exc.id,
          destino: { fecha: exc.nuevaFecha!, hora: exc.nuevaHora! },
        });
    }
  }

  for (const exc of excepciones) {
    const a = activas.get(exc.actividadId);
    if (!a || exc.tipo !== "REPROGRAMADA" || !exc.nuevaFecha || !exc.nuevaHora || !enRango(exc.nuevaFecha)) continue;
    items.push({
      tipo: "CLASE", fecha: exc.nuevaFecha, hora: exc.nuevaHora, horaFin: horaFin(exc.nuevaHora, a.duracionMin),
      titulo: a.nombre, estado: "REPROGRAMADA", motivo: exc.motivo, fechaOriginal: exc.fecha,
      actividadId: a.id, excepcionId: exc.id,
    });
  }

  for (const ev of eventos) {
    if (!enRango(ev.fecha)) continue;
    items.push({
      tipo: "EVENTO", fecha: ev.fecha, hora: ev.hora, titulo: ev.titulo, estado: "NORMAL", eventoId: ev.id,
      lugar: ev.lugar ?? undefined, descripcion: ev.descripcion ?? undefined,
    });
  }

  return items.sort(
    (x, y) => x.fecha.getTime() - y.fecha.getTime() || x.hora.localeCompare(y.hora) || x.titulo.localeCompare(y.titulo),
  );
}

/** Grilla del mes: semanas de lunes a domingo que cubren todos sus días. */
export function semanasDelMes(periodo: string): Date[][] {
  const [anio, mes] = periodo.split("-").map(Number);
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  const ultimo = new Date(Date.UTC(anio, mes, 0));
  const desde = primero.getTime() - ((primero.getUTCDay() + 6) % 7) * DIA_MS;
  const hasta = ultimo.getTime() + ((7 - ultimo.getUTCDay()) % 7) * DIA_MS;
  const semanas: Date[][] = [];
  for (let t = desde; t <= hasta; t += 7 * DIA_MS) {
    semanas.push(Array.from({ length: 7 }, (_, i) => new Date(t + i * DIA_MS)));
  }
  return semanas;
}
```

`src/modules/calendario/components/etiquetas.ts`:

```ts
// Textos de un ítem del calendario: corto para la grilla y completo para la agenda.
import { formatDiaCorto } from "@/lib/format";
import type { ItemCalendario } from "../reglas";

export function etiquetaItem(item: ItemCalendario): string {
  const base = `${item.hora} ${item.titulo}`;
  if (item.estado === "SUSPENDIDA") return `${base} (suspendida)`;
  if (item.estado === "MOVIDA" && item.destino) return `${base} → ${formatDiaCorto(item.destino.fecha)} ${item.destino.hora}`;
  if (item.estado === "REPROGRAMADA") return `${base} (reprogramada)`;
  return base;
}

export function detalleItem(item: ItemCalendario): string {
  const horario = item.horaFin ? `${item.hora}–${item.horaFin}` : item.hora;
  const base = `${horario} ${item.titulo}`;
  if (item.estado === "SUSPENDIDA") return `${base} · Suspendida: ${item.motivo}`;
  if (item.estado === "MOVIDA" && item.destino)
    return `${base} · Reprogramada al ${formatDiaCorto(item.destino.fecha)} ${item.destino.hora}: ${item.motivo}`;
  if (item.estado === "REPROGRAMADA" && item.fechaOriginal)
    return `${base} · Reprogramada desde ${formatDiaCorto(item.fechaOriginal)}: ${item.motivo}`;
  if (item.lugar) return `${base} · ${item.lugar}`;
  return base;
}
```

Run: `npx vitest run tests/unit/calendario-reglas.test.ts` y `TZ=UTC npx vitest run tests/unit/calendario-reglas.test.ts`
Expected: PASS (19 tests) en las dos corridas.

- [ ] **Step 3: Commit**

```bash
npm run typecheck
git add src/modules/calendario tests/unit/calendario-reglas.test.ts
git commit -m "Agrega las reglas puras del calendario (clases, excepciones, eventos y grilla)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Modelo, migración y consultas del calendario

**Files:**
- Modify: `prisma/schema.prisma` (`Actividad.duracionMin` y relaciones, `TipoExcepcion`, `ExcepcionClase`, `Evento`, relaciones en `Club`)
- Create: `prisma/migrations/20261012180000_calendario/migration.sql` (generado)
- Create: `src/modules/calendario/service.ts` (consultas)
- Modify: `src/modules/actividades/schema.ts` (`duracionMin`), `tests/helpers/factories.ts`
- Test: `tests/unit/validation.test.ts`, `tests/integration/calendario-consultas.test.ts`

**Interfaces:**
- Consumes: `armarCalendario`, tipos (Task 2); `DIA_MS` (Task 1).
- Produces:
  - `calendarioClub(clubId: string, desde: Date, hasta: Date): Promise<ItemCalendario[]>`
  - `calendarioSocio(clubId: string, socioId: string, desde: Date, hasta: Date): Promise<ItemCalendario[]>`
  - `MAX_DIAS_RANGO = 42`
  - Factories: `crearActividad` acepta `duracionMin` y `createdAt`; `crearExcepcion(clubId, actividadId, over?)`; `crearEvento(clubId, over?)`

- [ ] **Step 1: Detener el servidor de desarrollo si está corriendo**

```bash
lsof -tiTCP:3000 -sTCP:LISTEN | xargs kill 2>/dev/null; true
```

- [ ] **Step 2: Esquema y migración**

En `prisma/schema.prisma`:
- En `model Club`, después de `intentosPago IntentoPago[]`, agregar:

```prisma
  excepcionesClase ExcepcionClase[]
  eventos          Evento[]
```

- En `model Actividad`, después de `arancel ...`, agregar `duracionMin   Int           @default(60) // minutos, para mostrar "18:00–19:00"`. Después de `cargos        Cargo[]`, agregar:

```prisma
  excepciones   ExcepcionClase[]
  eventos       Evento[]
```

- Agregar al final:

```prisma
enum TipoExcepcion {
  SUSPENDIDA
  REPROGRAMADA
}

// Lo único que se guarda de las clases: lo que se aparta de la regla semanal.
model ExcepcionClase {
  id          String        @id @default(cuid())
  clubId      String
  club        Club          @relation(fields: [clubId], references: [id], onDelete: Cascade)
  actividadId String
  actividad   Actividad     @relation(fields: [actividadId], references: [id], onDelete: Cascade)
  fecha       DateTime // día original de la clase (medianoche UTC)
  tipo        TipoExcepcion
  nuevaFecha  DateTime? // solo REPROGRAMADA (medianoche UTC)
  nuevaHora   String? // "HH:MM", solo REPROGRAMADA
  motivo      String
  createdAt   DateTime      @default(now())

  @@unique([actividadId, fecha])
  @@index([clubId, fecha])
  @@index([clubId, nuevaFecha])
}

// Evento puntual informativo: para todo el club (actividadId null) o para los inscriptos de una actividad.
model Evento {
  id          String     @id @default(cuid())
  clubId      String
  club        Club       @relation(fields: [clubId], references: [id], onDelete: Cascade)
  titulo      String
  descripcion String?
  fecha       DateTime // medianoche UTC
  hora        String // "HH:MM"
  lugar       String?
  actividadId String?
  actividad   Actividad? @relation(fields: [actividadId], references: [id], onDelete: Cascade)
  createdAt   DateTime   @default(now())

  @@index([clubId, fecha])
}
```

```bash
npx prisma format
npx prisma migrate status   # "Database schema is up to date!"
mkdir -p prisma/migrations/20261012180000_calendario
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261012180000_calendario/migration.sql
grep -c 'CREATE TABLE' prisma/migrations/20261012180000_calendario/migration.sql   # 2
grep -n '"duracionMin"' prisma/migrations/20261012180000_calendario/migration.sql
npm run db:deploy
npx prisma generate
```

Expected: 2 tablas nuevas, la columna `duracionMin` agregada, "All migrations have been successfully applied".

- [ ] **Step 3: Duración en el schema de actividades (test primero)**

Agregar a `tests/unit/validation.test.ts`, dentro de `describe("actividadSchema", ...)`:

```ts
  it("la duración es opcional (60 min), se convierte desde texto y va de 15 a 600", () => {
    const base = { nombre: "Yoga", diaSemana: 6, hora: "10:00", cupo: 15 };
    expect(actividadSchema.parse(base).duracionMin).toBe(60);
    expect(actividadSchema.parse({ ...base, duracionMin: "90" }).duracionMin).toBe(90);
    expect(actividadSchema.safeParse({ ...base, duracionMin: 10 }).success).toBe(false);
    expect(actividadSchema.safeParse({ ...base, duracionMin: 601 }).success).toBe(false);
  });
```

Run: `npx vitest run tests/unit/validation.test.ts`. Expected: FAIL.

En `src/modules/actividades/schema.ts`, después de `arancel: ...`, agregar:

```ts
  duracionMin: entero(15, 600).default(60),
```

Run: `npx vitest run tests/unit/validation.test.ts`. Expected: PASS.

- [ ] **Step 4: Factories**

En `tests/helpers/factories.ts`, en `crearActividad`, agregar `duracionMin?: number; createdAt?: Date` al tipo de `over`. Agregar al final:

```ts
export function crearExcepcion(
  clubId: string,
  actividadId: string,
  over: {
    fecha?: Date;
    tipo?: "SUSPENDIDA" | "REPROGRAMADA";
    nuevaFecha?: Date | null;
    nuevaHora?: string | null;
    motivo?: string;
  } = {},
) {
  return db.excepcionClase.create({
    data: { clubId, actividadId, fecha: new Date(Date.UTC(2026, 9, 21)), tipo: "SUSPENDIDA", motivo: "Feriado", ...over },
  });
}

export function crearEvento(
  clubId: string,
  over: { titulo?: string; fecha?: Date; hora?: string; lugar?: string | null; descripcion?: string | null; actividadId?: string | null } = {},
) {
  const n = siguiente();
  return db.evento.create({
    data: { clubId, titulo: `Evento ${n}`, fecha: new Date(Date.UTC(2026, 9, 20)), hora: "20:00", ...over },
  });
}
```

- [ ] **Step 5: Tests de consultas (fallan primero)**

`tests/integration/calendario-consultas.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { Actividad, Club } from "@prisma/client";
import { calendarioClub, calendarioSocio } from "@/modules/calendario/service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const desdeSiempre = dia(2026, 1, 1);
const semana = [dia(2026, 10, 12), dia(2026, 10, 18)] as const; // lunes a domingo

let club: Club;
let natacion: Actividad;
let yoga: Actividad;

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
  natacion = await f.crearActividad(club.id, { nombre: "Natación", diaSemana: 3, hora: "19:00", createdAt: desdeSiempre });
  yoga = await f.crearActividad(club.id, { nombre: "Yoga", diaSemana: 6, hora: "10:00", createdAt: desdeSiempre });
});

describe("calendarioClub", () => {
  it("incluye todas las actividades activas y los eventos del club, no los de otro club", async () => {
    await f.crearActividad(club.id, { nombre: "Cerrada", diaSemana: 3, activa: false, createdAt: desdeSiempre });
    await f.crearEvento(club.id, { titulo: "Asamblea", fecha: dia(2026, 10, 13), hora: "20:00" });
    const otro = await f.crearClub();
    await f.crearActividad(otro.id, { nombre: "Ajena", diaSemana: 3, createdAt: desdeSiempre });
    await f.crearEvento(otro.id, { titulo: "Evento ajeno", fecha: dia(2026, 10, 13) });

    const items = await calendarioClub(club.id, ...semana);
    expect(items.map((i) => [i.titulo, i.fecha.getUTCDate()])).toEqual([
      ["Asamblea", 13],
      ["Natación", 14],
      ["Yoga", 17],
    ]);
  });

  it("trae la clase reprogramada hacia el rango aunque la fecha original esté afuera", async () => {
    await f.crearExcepcion(club.id, natacion.id, {
      fecha: dia(2026, 10, 7), tipo: "REPROGRAMADA", nuevaFecha: dia(2026, 10, 13), nuevaHora: "20:00", motivo: "Lluvia",
    });
    const items = await calendarioClub(club.id, ...semana);
    expect(items.find((i) => i.estado === "REPROGRAMADA")).toMatchObject({
      titulo: "Natación", fecha: dia(2026, 10, 13), fechaOriginal: dia(2026, 10, 7),
    });
  });

  it("acepta hasta 42 días y rechaza rangos mayores", async () => {
    await expect(calendarioClub(club.id, dia(2026, 9, 28), dia(2026, 11, 8))).resolves.toBeTruthy();
    await expect(calendarioClub(club.id, dia(2026, 9, 28), dia(2026, 11, 9))).rejects.toThrow(
      "El rango máximo es de 6 semanas",
    );
  });
});

describe("calendarioSocio", () => {
  it("muestra solo sus actividades y los eventos del club o de sus actividades", async () => {
    const socio = await f.crearSocio(club.id);
    await f.inscribirDirecto(club.id, natacion.id, socio.id);
    await f.crearEvento(club.id, { titulo: "Asamblea", fecha: dia(2026, 10, 13) });
    await f.crearEvento(club.id, { titulo: "Clínica de natación", fecha: dia(2026, 10, 15), actividadId: natacion.id });
    await f.crearEvento(club.id, { titulo: "Retiro de yoga", fecha: dia(2026, 10, 16), actividadId: yoga.id });

    const items = await calendarioSocio(club.id, socio.id, ...semana);
    expect(items.map((i) => i.titulo)).toEqual(["Asamblea", "Natación", "Clínica de natación"]);
  });
});
```

Run: `npx vitest run --project integration tests/integration/calendario-consultas.test.ts`
Expected: FAIL (no resuelve `@/modules/calendario/service`).

- [ ] **Step 6: Implementar las consultas**

`src/modules/calendario/service.ts`:

```ts
// Calendario del club: consultas por rango (admin y socio) y operaciones del admin.
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { DIA_MS } from "@/lib/periodo";
import { armarCalendario } from "./reglas";

export const MAX_DIAS_RANGO = 42;

function validarRango(desde: Date, hasta: Date) {
  const dias = (hasta.getTime() - desde.getTime()) / DIA_MS + 1;
  if (dias < 1) throw new DomainError("Rango de fechas inválido");
  if (dias > MAX_DIAS_RANGO) throw new DomainError("El rango máximo es de 6 semanas");
}

const excepcionesDelRango = (desde: Date, hasta: Date) => ({
  OR: [{ fecha: { gte: desde, lte: hasta } }, { nuevaFecha: { gte: desde, lte: hasta } }],
});

/** Calendario del admin: todas las actividades activas y todos los eventos del club. */
export async function calendarioClub(clubId: string, desde: Date, hasta: Date) {
  validarRango(desde, hasta);
  const [actividades, excepciones, eventos] = await Promise.all([
    db.actividad.findMany({ where: { clubId, activa: true } }),
    db.excepcionClase.findMany({ where: { clubId, ...excepcionesDelRango(desde, hasta) } }),
    db.evento.findMany({ where: { clubId, fecha: { gte: desde, lte: hasta } } }),
  ]);
  return armarCalendario({ actividades, excepciones, eventos, desde, hasta });
}

/** Calendario del socio: sus actividades y los eventos del club o de esas actividades. */
export async function calendarioSocio(clubId: string, socioId: string, desde: Date, hasta: Date) {
  validarRango(desde, hasta);
  const inscripciones = await db.inscripcion.findMany({ where: { clubId, socioId }, select: { actividadId: true } });
  const ids = inscripciones.map((i) => i.actividadId);
  const [actividades, excepciones, eventos] = await Promise.all([
    db.actividad.findMany({ where: { clubId, activa: true, id: { in: ids } } }),
    db.excepcionClase.findMany({ where: { clubId, actividadId: { in: ids }, ...excepcionesDelRango(desde, hasta) } }),
    db.evento.findMany({
      where: { clubId, fecha: { gte: desde, lte: hasta }, OR: [{ actividadId: null }, { actividadId: { in: ids } }] },
    }),
  ]);
  return armarCalendario({ actividades, excepciones, eventos, desde, hasta });
}
```

Run: `npx vitest run --project integration tests/integration/calendario-consultas.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Verificar y commitear**

```bash
npm run typecheck
npm test
git add -A prisma src tests
git commit -m "Agrega el modelo de excepciones y eventos y las consultas del calendario

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Operaciones del admin (suspender, reprogramar, restablecer, eventos)

**Files:**
- Create: `src/modules/calendario/schema.ts`
- Modify: `src/modules/calendario/service.ts` (operaciones, `obtenerClase` y `obtenerEvento`)
- Test: `tests/integration/calendario-operaciones.test.ts`

**Interfaces:**
- Consumes: `clasesEnRango`, `parsearDia` (Task 2); `inicioDelDia` (Task 1).
- Produces:
  - `suspenderClase(clubId, input: { actividadId; fecha: "YYYY-MM-DD"; motivo }, hoy?): Promise<ExcepcionClase>`
  - `reprogramarClase(clubId, input: { actividadId; fecha; nuevaFecha; nuevaHora; motivo }, hoy?): Promise<ExcepcionClase>`
  - `restablecerClase(clubId, excepcionId, hoy?): Promise<void>`
  - `crearEvento(clubId, input: { titulo; fecha; hora; lugar?; descripcion?; actividadId? }, hoy?): Promise<Evento>`
  - `eliminarEvento(clubId, eventoId): Promise<void>`
  - `obtenerClase(clubId, clave: string /* "<actividadId>:<YYYY-MM-DD>" */): Promise<{ actividad: Actividad; fecha: Date; excepcion: ExcepcionClase | null } | null>`
  - `obtenerEvento(clubId, eventoId): Promise<(Evento & { actividad: { nombre: string } | null }) | null>`

- [ ] **Step 1: Tests (fallan primero)**

`tests/integration/calendario-operaciones.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { Actividad, Club } from "@prisma/client";
import { db } from "@/lib/db";
import {
  calendarioClub,
  crearEvento,
  eliminarEvento,
  obtenerClase,
  obtenerEvento,
  reprogramarClase,
  restablecerClase,
  suspenderClase,
} from "@/modules/calendario/service";
import { resetDb } from "../helpers/db";
import * as f from "../helpers/factories";

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));
const hoy = new Date(Date.UTC(2026, 9, 15, 15)); // jueves 15/10/2026 12:00 en Argentina

let club: Club;
let natacion: Actividad; // miércoles 19:00

beforeEach(async () => {
  await resetDb();
  club = await f.crearClub();
  natacion = await f.crearActividad(club.id, { nombre: "Natación", diaSemana: 3, hora: "19:00", createdAt: dia(2026, 1, 1) });
});

const suspender = (over: Record<string, string> = {}) =>
  suspenderClase(club.id, { actividadId: natacion.id, fecha: "2026-10-21", motivo: "Feriado", ...over }, hoy);

describe("suspenderClase", () => {
  it("suspende una clase futura de la regla", async () => {
    const e = await suspender();
    expect(e).toMatchObject({ tipo: "SUSPENDIDA", fecha: dia(2026, 10, 21), motivo: "Feriado", clubId: club.id });
  });

  it("rechaza una fecha que no es de la regla", async () => {
    await expect(suspender({ fecha: "2026-10-22" })).rejects.toThrow("Esa fecha no corresponde a una clase de la actividad");
  });

  it("rechaza clases pasadas", async () => {
    await expect(suspender({ fecha: "2026-10-14" })).rejects.toThrow("No se pueden modificar clases pasadas");
  });

  it("rechaza una clase que ya tiene un cambio", async () => {
    await suspender();
    await expect(suspender({ motivo: "Lluvia" })).rejects.toThrow("Esa clase ya tiene un cambio: restablecela primero");
  });

  it("rechaza actividades de otro club o inactivas", async () => {
    const otro = await f.crearClub();
    const ajena = await f.crearActividad(otro.id, { diaSemana: 3, createdAt: dia(2026, 1, 1) });
    await expect(suspender({ actividadId: ajena.id })).rejects.toThrow("Actividad no encontrada");
    const cerrada = await f.crearActividad(club.id, { diaSemana: 3, activa: false, createdAt: dia(2026, 1, 1) });
    await expect(suspender({ actividadId: cerrada.id })).rejects.toThrow("Actividad no encontrada");
  });

  it("exige motivo y una fecha válida", async () => {
    await expect(suspender({ motivo: "" })).rejects.toBeInstanceOf(ZodError);
    await expect(suspender({ fecha: "2026-02-31" })).rejects.toBeInstanceOf(ZodError);
  });
});

describe("reprogramarClase", () => {
  const reprogramar = (over: Record<string, string> = {}) =>
    reprogramarClase(
      club.id,
      { actividadId: natacion.id, fecha: "2026-10-21", nuevaFecha: "2026-10-22", nuevaHora: "20:00", motivo: "Pileta en mantenimiento", ...over },
      hoy,
    );

  it("guarda la nueva fecha y hora", async () => {
    expect(await reprogramar()).toMatchObject({
      tipo: "REPROGRAMADA", fecha: dia(2026, 10, 21), nuevaFecha: dia(2026, 10, 22), nuevaHora: "20:00",
    });
  });

  it("rechaza una nueva fecha pasada", async () => {
    await expect(reprogramar({ nuevaFecha: "2026-10-10" })).rejects.toThrow("La nueva fecha no puede ser pasada");
  });

  it("rechaza el mismo horario que el original", async () => {
    await expect(reprogramar({ nuevaFecha: "2026-10-21", nuevaHora: "19:00" })).rejects.toThrow(
      "Elegí una fecha u hora distinta",
    );
  });
});

describe("restablecerClase", () => {
  it("borra el cambio y la clase vuelve a la regla", async () => {
    const e = await suspender();
    await restablecerClase(club.id, e.id, hoy);
    expect(await db.excepcionClase.count()).toBe(0);
    const items = await calendarioClub(club.id, dia(2026, 10, 21), dia(2026, 10, 21));
    expect(items[0]).toMatchObject({ estado: "NORMAL" });
  });

  it("no restablece cambios de otro club", async () => {
    const otro = await f.crearClub();
    const ajena = await f.crearActividad(otro.id, { diaSemana: 3, createdAt: dia(2026, 1, 1) });
    const e = await f.crearExcepcion(otro.id, ajena.id);
    await expect(restablecerClase(club.id, e.id, hoy)).rejects.toThrow("Cambio no encontrado");
  });

  it("no restablece clases pasadas", async () => {
    const e = await f.crearExcepcion(club.id, natacion.id, { fecha: dia(2026, 10, 7) });
    await expect(restablecerClase(club.id, e.id, hoy)).rejects.toThrow("No se pueden modificar clases pasadas");
  });
});

describe("eventos", () => {
  it("crea un evento para todo el club (campos opcionales vacíos quedan en null)", async () => {
    const ev = await crearEvento(
      club.id,
      { titulo: "Asamblea anual", fecha: "2026-10-20", hora: "20:00", lugar: "", descripcion: "", actividadId: "" },
      hoy,
    );
    expect(ev).toMatchObject({ titulo: "Asamblea anual", fecha: dia(2026, 10, 20), lugar: null, descripcion: null, actividadId: null });
  });

  it("crea un evento para los inscriptos de una actividad", async () => {
    const ev = await crearEvento(
      club.id,
      { titulo: "Clínica", fecha: "2026-10-20", hora: "10:00", lugar: "Pileta", actividadId: natacion.id },
      hoy,
    );
    expect(ev).toMatchObject({ actividadId: natacion.id, lugar: "Pileta" });
  });

  it("rechaza una actividad de otro club y una fecha pasada", async () => {
    const otro = await f.crearClub();
    const ajena = await f.crearActividad(otro.id);
    await expect(
      crearEvento(club.id, { titulo: "Clínica", fecha: "2026-10-20", hora: "10:00", actividadId: ajena.id }, hoy),
    ).rejects.toThrow("Actividad no encontrada");
    await expect(crearEvento(club.id, { titulo: "Viejo", fecha: "2026-10-01", hora: "10:00" }, hoy)).rejects.toThrow(
      "La fecha no puede ser pasada",
    );
  });

  it("elimina un evento del club y rechaza uno de otro club", async () => {
    const ev = await f.crearEvento(club.id);
    await eliminarEvento(club.id, ev.id);
    expect(await db.evento.count()).toBe(0);
    const otro = await f.crearClub();
    const ajeno = await f.crearEvento(otro.id);
    await expect(eliminarEvento(club.id, ajeno.id)).rejects.toThrow("Evento no encontrado");
  });
});

describe("obtenerClase / obtenerEvento (selección desde la URL)", () => {
  it("devuelve la clase con su cambio si existe", async () => {
    const e = await suspender();
    const c = await obtenerClase(club.id, `${natacion.id}:2026-10-21`);
    expect(c?.actividad.id).toBe(natacion.id);
    expect(c?.fecha).toEqual(dia(2026, 10, 21));
    expect(c?.excepcion?.id).toBe(e.id);
  });

  it("devuelve null para claves manipuladas: otro club, fecha fuera de la regla o mal formada", async () => {
    const otro = await f.crearClub();
    const ajena = await f.crearActividad(otro.id, { diaSemana: 3, createdAt: dia(2026, 1, 1) });
    expect(await obtenerClase(club.id, `${ajena.id}:2026-10-21`)).toBeNull();
    expect(await obtenerClase(club.id, `${natacion.id}:2026-10-22`)).toBeNull();
    expect(await obtenerClase(club.id, `${natacion.id}:basura`)).toBeNull();
    expect(await obtenerClase(club.id, "sin-separador")).toBeNull();
  });

  it("obtenerEvento solo encuentra eventos del club", async () => {
    const ev = await f.crearEvento(club.id, { actividadId: natacion.id });
    expect((await obtenerEvento(club.id, ev.id))?.actividad?.nombre).toBe("Natación");
    const otro = await f.crearClub();
    expect(await obtenerEvento(otro.id, ev.id)).toBeNull();
  });
});
```

Run: `npx vitest run --project integration tests/integration/calendario-operaciones.test.ts`
Expected: FAIL (`suspenderClase` y las demás no existen).

- [ ] **Step 2: Implementar**

`src/modules/calendario/schema.ts`:

```ts
// Validación de entrada del módulo calendario. Las fechas llegan como "AAAA-MM-DD" (input date).
import { z } from "zod";
import { texto } from "@/lib/validation";
import { parsearDia } from "./reglas";

const dia = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const fecha = parsearDia(v);
    if (!fecha) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fecha inválida" });
      return z.NEVER;
    }
    return fecha;
  });

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora con formato HH:MM");

/** Texto opcional de formulario: "" o ausente → null. */
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const suspenderClaseSchema = z.object({
  actividadId: z.string().min(1),
  fecha: dia,
  motivo: texto(200),
});

export const reprogramarClaseSchema = suspenderClaseSchema.extend({
  nuevaFecha: dia,
  nuevaHora: hora,
});

export const eventoSchema = z.object({
  titulo: texto(80),
  fecha: dia,
  hora,
  lugar: opcional(80),
  descripcion: opcional(500),
  actividadId: opcional(64),
});
```

En `src/modules/calendario/service.ts`, reemplazar los imports por:

```ts
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { DIA_MS, inicioDelDia } from "@/lib/periodo";
import { armarCalendario, clasesEnRango, parsearDia } from "./reglas";
import { eventoSchema, reprogramarClaseSchema, suspenderClaseSchema } from "./schema";
```

y agregar al final:

```ts
const esPasada = (fecha: Date, hoy: Date) => fecha.getTime() < inicioDelDia(hoy).getTime();

/** Verifica que (actividad, fecha) sea una clase modificable de la regla y devuelve la actividad. */
async function claseModificable(clubId: string, actividadId: string, fecha: Date, hoy: Date) {
  const actividad = await db.actividad.findFirst({ where: { id: actividadId, clubId, activa: true } });
  if (!actividad) throw new DomainError("Actividad no encontrada");
  if (clasesEnRango(actividad, fecha, fecha).length === 0) {
    throw new DomainError("Esa fecha no corresponde a una clase de la actividad");
  }
  if (esPasada(fecha, hoy)) throw new DomainError("No se pueden modificar clases pasadas");
  return actividad;
}

/** Crea la excepción; si la clase ya tenía una (UNIQUE actividad+fecha), avisa que hay que restablecerla. */
async function guardarExcepcion(data: Prisma.ExcepcionClaseUncheckedCreateInput) {
  try {
    return await db.excepcionClase.create({ data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new DomainError("Esa clase ya tiene un cambio: restablecela primero");
    }
    throw e;
  }
}

export async function suspenderClase(clubId: string, input: unknown, hoy: Date = new Date()) {
  const data = suspenderClaseSchema.parse(input);
  await claseModificable(clubId, data.actividadId, data.fecha, hoy);
  return guardarExcepcion({ clubId, actividadId: data.actividadId, fecha: data.fecha, tipo: "SUSPENDIDA", motivo: data.motivo });
}

export async function reprogramarClase(clubId: string, input: unknown, hoy: Date = new Date()) {
  const data = reprogramarClaseSchema.parse(input);
  const actividad = await claseModificable(clubId, data.actividadId, data.fecha, hoy);
  if (esPasada(data.nuevaFecha, hoy)) throw new DomainError("La nueva fecha no puede ser pasada");
  if (data.nuevaFecha.getTime() === data.fecha.getTime() && data.nuevaHora === actividad.hora) {
    throw new DomainError("Elegí una fecha u hora distinta");
  }
  return guardarExcepcion({
    clubId, actividadId: data.actividadId, fecha: data.fecha, tipo: "REPROGRAMADA",
    nuevaFecha: data.nuevaFecha, nuevaHora: data.nuevaHora, motivo: data.motivo,
  });
}

/** Deshace una suspensión o reprogramación: la clase vuelve a la regla. */
export async function restablecerClase(clubId: string, excepcionId: string, hoy: Date = new Date()) {
  const excepcion = await db.excepcionClase.findFirst({ where: { id: excepcionId, clubId } });
  if (!excepcion) throw new DomainError("Cambio no encontrado");
  if (esPasada(excepcion.fecha, hoy)) throw new DomainError("No se pueden modificar clases pasadas");
  await db.excepcionClase.delete({ where: { id: excepcion.id } });
}

export async function crearEvento(clubId: string, input: unknown, hoy: Date = new Date()) {
  const data = eventoSchema.parse(input);
  if (esPasada(data.fecha, hoy)) throw new DomainError("La fecha no puede ser pasada");
  if (data.actividadId) {
    const actividad = await db.actividad.findFirst({ where: { id: data.actividadId, clubId }, select: { id: true } });
    if (!actividad) throw new DomainError("Actividad no encontrada");
  }
  return db.evento.create({ data: { clubId, ...data } });
}

export async function eliminarEvento(clubId: string, eventoId: string) {
  const { count } = await db.evento.deleteMany({ where: { id: eventoId, clubId } });
  if (count === 0) throw new DomainError("Evento no encontrado");
}

/** Clase elegida en la UI ("<actividadId>:<AAAA-MM-DD>"); null si la clave no es una clase del club. */
export async function obtenerClase(clubId: string, clave: string) {
  const [actividadId, textoFecha] = clave.split(":");
  const fecha = textoFecha ? parsearDia(textoFecha) : null;
  if (!actividadId || !fecha) return null;
  const actividad = await db.actividad.findFirst({ where: { id: actividadId, clubId } });
  if (!actividad || clasesEnRango(actividad, fecha, fecha).length === 0) return null;
  const excepcion = await db.excepcionClase.findUnique({ where: { actividadId_fecha: { actividadId, fecha } } });
  return { actividad, fecha, excepcion };
}

export function obtenerEvento(clubId: string, eventoId: string) {
  return db.evento.findFirst({
    where: { id: eventoId, clubId },
    include: { actividad: { select: { nombre: true } } },
  });
}
```

(`DIA_MS` sigue en uso en `validarRango`.)

Run: `npx vitest run --project integration tests/integration/calendario-operaciones.test.ts`
Expected: PASS (19 tests).

- [ ] **Step 3: Verificar y commitear**

```bash
npm run typecheck
npm test
git add src/modules/calendario tests/integration/calendario-operaciones.test.ts
git commit -m "Agrega suspender, reprogramar y restablecer clases y la gestión de eventos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Componentes y pestaña "Calendario" del admin

**Files:**
- Create: `src/modules/calendario/actions.ts`, `src/modules/calendario/components/CalendarioMes.tsx`, `src/modules/calendario/components/AgendaLista.tsx`, `src/modules/calendario/components/NavegacionMes.tsx`, `src/app/c/[slug]/admin/calendario/page.tsx`
- Modify: `src/app/c/[slug]/admin/layout.tsx` (pestaña), `src/app/c/[slug]/admin/actividades/page.tsx` (duración y horario)

**Interfaces:**
- Consumes: todo lo de las Tasks 1 a 4.
- Produces:
  - Actions: `suspenderClaseAction(slug, mes, actividadId, fecha, formData)`, `reprogramarClaseAction(slug, mes, actividadId, fecha, formData)`, `restablecerClaseAction(slug, mes, excepcionId)`, `crearEventoAction(slug, mes, formData)`, `eliminarEventoAction(slug, mes, eventoId)`
  - Componentes: `<CalendarioMes periodo items hoy hrefItem? />`, `<AgendaLista items hrefItem? vacio? />`, `<NavegacionMes periodo base />`

La UI no tiene tests automáticos: no hay un entorno de render configurado. Las piezas que se pueden testear (textos, grilla, rangos y operaciones) ya están cubiertas en las Tasks 2 a 4. La UI se verifica con typecheck y en la demo de la Task 7.

- [ ] **Step 1: Actions**

`src/modules/calendario/actions.ts`:

```ts
"use server";

// Server Actions del calendario (admin de club). Cada una re-verifica acceso con requireClub
// y vuelve al mes que se estaba viendo, sin selección.
import { datos, ejecutar, rutaAdmin } from "@/lib/action";
import { requireClub } from "@/lib/session";
import { crearEvento, eliminarEvento, reprogramarClase, restablecerClase, suspenderClase } from "./service";

const rutaCalendario = (slug: string, mes: string) => `${rutaAdmin(slug)}/calendario?mes=${mes}`;

export async function suspenderClaseAction(slug: string, mes: string, actividadId: string, fecha: string, formData: FormData) {
  await ejecutar(rutaCalendario(slug, mes), async () => {
    const { club } = await requireClub(slug, "admin");
    await suspenderClase(club.id, { ...datos(formData), actividadId, fecha });
    return "Clase suspendida";
  });
}

export async function reprogramarClaseAction(slug: string, mes: string, actividadId: string, fecha: string, formData: FormData) {
  await ejecutar(rutaCalendario(slug, mes), async () => {
    const { club } = await requireClub(slug, "admin");
    await reprogramarClase(club.id, { ...datos(formData), actividadId, fecha });
    return "Clase reprogramada";
  });
}

export async function restablecerClaseAction(slug: string, mes: string, excepcionId: string) {
  await ejecutar(rutaCalendario(slug, mes), async () => {
    const { club } = await requireClub(slug, "admin");
    await restablecerClase(club.id, excepcionId);
    return "Clase restablecida";
  });
}

export async function crearEventoAction(slug: string, mes: string, formData: FormData) {
  await ejecutar(rutaCalendario(slug, mes), async () => {
    const { club } = await requireClub(slug, "admin");
    await crearEvento(club.id, datos(formData));
    return "Evento creado";
  });
}

export async function eliminarEventoAction(slug: string, mes: string, eventoId: string) {
  await ejecutar(rutaCalendario(slug, mes), async () => {
    const { club } = await requireClub(slug, "admin");
    await eliminarEvento(club.id, eventoId);
    return "Evento eliminado";
  });
}
```

- [ ] **Step 2: Componentes**

`src/modules/calendario/components/NavegacionMes.tsx`:

```tsx
import Link from "next/link";
import { nombreMes } from "@/lib/format";
import { periodoAnterior, periodoSiguiente } from "@/lib/periodo";

/** "← septiembre 2026 · octubre 2026 · noviembre 2026 →" con links a `${base}?mes=…`. */
export function NavegacionMes({ periodo, base }: { periodo: string; base: string }) {
  const anterior = periodoAnterior(periodo);
  const siguiente = periodoSiguiente(periodo);
  return (
    <div className="mb-4 flex items-center justify-between text-sm">
      <Link href={`${base}?mes=${anterior}`} className="text-emerald-700 underline">
        ← {nombreMes(anterior)}
      </Link>
      <span className="text-base font-semibold capitalize text-slate-800">{nombreMes(periodo)}</span>
      <Link href={`${base}?mes=${siguiente}`} className="text-emerald-700 underline">
        {nombreMes(siguiente)} →
      </Link>
    </div>
  );
}
```

`src/modules/calendario/components/AgendaLista.tsx`:

```tsx
import Link from "next/link";
import { formatDiaCorto } from "@/lib/format";
import { claveDia, type ItemCalendario } from "../reglas";
import { detalleItem } from "./etiquetas";

export const estiloItem: Record<string, string> = {
  NORMAL: "text-slate-700",
  SUSPENDIDA: "text-red-700 line-through",
  MOVIDA: "text-slate-400 line-through",
  REPROGRAMADA: "text-amber-700",
  EVENTO: "text-emerald-700 font-medium",
};

export const claseDeItem = (i: ItemCalendario) => (i.tipo === "EVENTO" ? estiloItem.EVENTO : estiloItem[i.estado]);

/** Ítems agrupados por día, con el texto completo (horario, estado y motivo). */
export function AgendaLista({
  items,
  hrefItem,
  vacio = "Sin clases ni eventos.",
}: {
  items: ItemCalendario[];
  hrefItem?: (i: ItemCalendario) => string;
  vacio?: string;
}) {
  if (items.length === 0) return <p className="text-sm text-slate-500">{vacio}</p>;
  const dias = new Map<string, ItemCalendario[]>();
  for (const i of items) dias.set(claveDia(i.fecha), [...(dias.get(claveDia(i.fecha)) ?? []), i]);
  return (
    <ul className="flex flex-col gap-3">
      {[...dias.values()].map((delDia) => (
        <li key={claveDia(delDia[0].fecha)}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{formatDiaCorto(delDia[0].fecha)}</p>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {delDia.map((i) => (
              <li key={`${i.tipo}-${i.actividadId ?? i.eventoId}-${i.estado}-${i.hora}`} className={claseDeItem(i)}>
                {hrefItem ? (
                  <Link href={hrefItem(i)} className="hover:underline">
                    {detalleItem(i)}
                  </Link>
                ) : (
                  detalleItem(i)
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
```

`src/modules/calendario/components/CalendarioMes.tsx`:

```tsx
import Link from "next/link";
import { claveDia, semanasDelMes, type ItemCalendario } from "../reglas";
import { AgendaLista, claseDeItem } from "./AgendaLista";
import { detalleItem, etiquetaItem } from "./etiquetas";

const CABECERA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Grilla mensual (desde md) y agenda (en celular) con los mismos ítems. */
export function CalendarioMes({
  periodo,
  items,
  hoy,
  hrefItem,
}: {
  periodo: string;
  items: ItemCalendario[];
  hoy: Date;
  hrefItem?: (i: ItemCalendario) => string;
}) {
  const porDia = new Map<string, ItemCalendario[]>();
  for (const i of items) porDia.set(claveDia(i.fecha), [...(porDia.get(claveDia(i.fecha)) ?? []), i]);
  const delMes = items.filter((i) => claveDia(i.fecha).startsWith(periodo));

  return (
    <>
      <div className="hidden md:block">
        <div className="grid grid-cols-7 pb-1 text-center text-xs font-medium text-slate-500">
          {CABECERA.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
          {semanasDelMes(periodo)
            .flat()
            .map((dia) => {
              const clave = claveDia(dia);
              const esHoy = clave === claveDia(hoy);
              const fuera = !clave.startsWith(periodo);
              return (
                <div key={clave} className={`min-h-24 p-1.5 ${fuera ? "bg-slate-50 opacity-60" : "bg-white"}`}>
                  <p className={`text-xs ${esHoy ? "font-bold text-emerald-700" : "text-slate-500"}`}>{dia.getUTCDate()}</p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                    {(porDia.get(clave) ?? []).map((i) => (
                      <li
                        key={`${i.tipo}-${i.actividadId ?? i.eventoId}-${i.estado}-${i.hora}`}
                        className={`truncate ${claseDeItem(i)}`}
                        title={detalleItem(i)}
                      >
                        {hrefItem ? (
                          <Link href={hrefItem(i)} className="hover:underline">
                            {etiquetaItem(i)}
                          </Link>
                        ) : (
                          etiquetaItem(i)
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
        </div>
      </div>
      <div className="md:hidden">
        <AgendaLista items={delMes} hrefItem={hrefItem} vacio="Sin clases ni eventos este mes." />
      </div>
    </>
  );
}
```

- [ ] **Step 3: Pantalla del admin**

`src/app/c/[slug]/admin/calendario/page.tsx`:

```tsx
import { leerAviso } from "@/lib/aviso";
import { requireClub } from "@/lib/session";
import { formatDiaCorto } from "@/lib/format";
import { inicioDelDia } from "@/lib/periodo";
import { listarActividades } from "@/modules/actividades/service";
import {
  crearEventoAction,
  eliminarEventoAction,
  reprogramarClaseAction,
  restablecerClaseAction,
  suspenderClaseAction,
} from "@/modules/calendario/actions";
import { CalendarioMes } from "@/modules/calendario/components/CalendarioMes";
import { NavegacionMes } from "@/modules/calendario/components/NavegacionMes";
import { claveDia, horaFin, mesDeParam, semanasDelMes, type ItemCalendario } from "@/modules/calendario/reglas";
import { calendarioClub, obtenerClase, obtenerEvento } from "@/modules/calendario/service";
import { Aviso, Boton, Campo, Card, Selector, Titulo } from "@/components/ui";

export default async function CalendarioAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mes?: string; clase?: string; evento?: string; ok?: string; error?: string; f?: string }>;
}) {
  const { slug } = await params;
  const { club } = await requireClub(slug, "admin");
  const sp = await searchParams;
  const periodo = mesDeParam(sp.mes);
  const semanas = semanasDelMes(periodo);
  const hoy = inicioDelDia();
  const base = `/c/${slug}/admin/calendario`;

  const [items, actividades, clase, evento] = await Promise.all([
    calendarioClub(club.id, semanas[0][0], semanas.at(-1)![6]),
    listarActividades(club.id),
    sp.clase ? obtenerClase(club.id, sp.clase) : null,
    sp.evento ? obtenerEvento(club.id, sp.evento) : null,
  ]);

  const hrefItem = (i: ItemCalendario) =>
    i.tipo === "EVENTO"
      ? `${base}?mes=${periodo}&evento=${i.eventoId}`
      : `${base}?mes=${periodo}&clase=${i.actividadId}:${claveDia(i.estado === "REPROGRAMADA" ? i.fechaOriginal! : i.fecha)}`;
  const clasePasada = clase ? clase.fecha.getTime() < hoy.getTime() : false;

  return (
    <>
      <Titulo sub="Clases de cada semana, cambios y eventos del club">Calendario</Titulo>
      <Aviso {...leerAviso(sp)} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <NavegacionMes periodo={periodo} base={base} />
            <CalendarioMes periodo={periodo} items={items} hoy={hoy} hrefItem={hrefItem} />
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {clase && (
            <Card title="Clase seleccionada">
              <p className="text-sm text-slate-700">
                <strong>{clase.actividad.nombre}</strong> · {formatDiaCorto(clase.fecha)} · {clase.actividad.hora}–
                {horaFin(clase.actividad.hora, clase.actividad.duracionMin)}
              </p>
              {clase.excepcion ? (
                <div className="mt-3 flex flex-col gap-3 text-sm">
                  <p className="text-slate-600">
                    {clase.excepcion.tipo === "SUSPENDIDA"
                      ? `Suspendida: ${clase.excepcion.motivo}`
                      : `Reprogramada al ${formatDiaCorto(clase.excepcion.nuevaFecha!)} ${clase.excepcion.nuevaHora}: ${clase.excepcion.motivo}`}
                  </p>
                  {!clasePasada && (
                    <form action={restablecerClaseAction.bind(null, slug, periodo, clase.excepcion.id)}>
                      <Boton variante="secundario">Restablecer</Boton>
                    </form>
                  )}
                </div>
              ) : clasePasada ? (
                <p className="mt-3 text-sm text-slate-500">Clase pasada: solo lectura.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-5">
                  <form
                    action={suspenderClaseAction.bind(null, slug, periodo, clase.actividad.id, claveDia(clase.fecha))}
                    className="flex flex-col gap-3"
                  >
                    <Campo label="Motivo de la suspensión" name="motivo" placeholder="Feriado, lluvia…" required />
                    <Boton variante="peligro">Suspender clase</Boton>
                  </form>
                  <form
                    action={reprogramarClaseAction.bind(null, slug, periodo, clase.actividad.id, claveDia(clase.fecha))}
                    className="flex flex-col gap-3 border-t border-slate-100 pt-4"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <Campo label="Nueva fecha" name="nuevaFecha" type="date" min={claveDia(hoy)} required />
                      <Campo label="Nueva hora" name="nuevaHora" type="time" defaultValue={clase.actividad.hora} required />
                    </div>
                    <Campo label="Motivo" name="motivo" required />
                    <Boton variante="secundario">Reprogramar</Boton>
                  </form>
                </div>
              )}
            </Card>
          )}

          {evento && (
            <Card title="Evento seleccionado">
              <p className="text-sm text-slate-700">
                <strong>{evento.titulo}</strong> · {formatDiaCorto(evento.fecha)} {evento.hora}
              </p>
              {evento.lugar && <p className="text-sm text-slate-600">Lugar: {evento.lugar}</p>}
              {evento.descripcion && <p className="text-sm text-slate-600">{evento.descripcion}</p>}
              <p className="text-sm text-slate-500">
                Para: {evento.actividad ? `inscriptos de ${evento.actividad.nombre}` : "todo el club"}
              </p>
              <form action={eliminarEventoAction.bind(null, slug, periodo, evento.id)} className="mt-3">
                <Boton variante="peligro">Eliminar evento</Boton>
              </form>
            </Card>
          )}

          <Card title="Nuevo evento">
            <form action={crearEventoAction.bind(null, slug, periodo)} className="flex flex-col gap-3">
              <Campo label="Título" name="titulo" placeholder="Asamblea anual" required />
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Fecha" name="fecha" type="date" min={claveDia(hoy)} required />
                <Campo label="Hora" name="hora" type="time" required />
              </div>
              <Campo label="Lugar (opcional)" name="lugar" />
              <Campo label="Descripción (opcional)" name="descripcion" />
              <Selector label="Para" name="actividadId" defaultValue="">
                <option value="">Todo el club</option>
                {actividades
                  .filter((a) => a.activa)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      Inscriptos de {a.nombre}
                    </option>
                  ))}
              </Selector>
              <Boton type="submit">Crear evento</Boton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
```

`src/app/c/[slug]/admin/layout.tsx`: en `items`, después de `{ href: \`${base}/actividades\`, label: "Actividades" },` agregar `{ href: \`${base}/calendario\`, label: "Calendario" },`.

`src/app/c/[slug]/admin/actividades/page.tsx`:
- Agregar `import { horaFin } from "@/modules/calendario/reglas";`.
- Headers `["Actividad", "Día", "Hora", "Arancel", "Inscriptos / cupo"]` → `["Actividad", "Día", "Horario", "Arancel", "Inscriptos / cupo"]`.
- `<td className="py-2 pr-4">{a.hora}</td>` → `<td className="py-2 pr-4">{a.hora}–{horaFin(a.hora, a.duracionMin)}</td>`.
- Después del campo `Hora`, agregar `<Campo label="Duración (min)" name="duracionMin" type="number" min={15} max={600} defaultValue={60} />`.

- [ ] **Step 4: Verificar y commitear**

```bash
npm run typecheck
npm test
git add -A src
git commit -m "Agrega la pestaña Calendario del admin con gestión de clases y eventos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: typecheck sin errores; todos los tests PASS.

---

### Task 6: Calendario del socio

**Files:**
- Create: `src/app/c/[slug]/socio/calendario/page.tsx`
- Modify: `src/app/c/[slug]/socio/page.tsx` (card "Próximos 7 días")

**Interfaces:**
- Consumes: `calendarioSocio` (Task 3); `AgendaLista`, `CalendarioMes`, `NavegacionMes` (Task 5); `inicioDelDia`, `DIA_MS`, `mesDeParam`, `semanasDelMes`.

- [ ] **Step 1: Página del calendario del socio**

`src/app/c/[slug]/socio/calendario/page.tsx`:

```tsx
import Link from "next/link";
import { requireClub } from "@/lib/session";
import { inicioDelDia } from "@/lib/periodo";
import { CalendarioMes } from "@/modules/calendario/components/CalendarioMes";
import { NavegacionMes } from "@/modules/calendario/components/NavegacionMes";
import { mesDeParam, semanasDelMes } from "@/modules/calendario/reglas";
import { calendarioSocio } from "@/modules/calendario/service";
import { Card, Titulo } from "@/components/ui";

export default async function CalendarioSocioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { slug } = await params;
  const { club, user } = await requireClub(slug, "socio");
  const periodo = mesDeParam((await searchParams).mes);
  const semanas = semanasDelMes(periodo);
  const items = await calendarioSocio(club.id, user.socioId!, semanas[0][0], semanas.at(-1)![6]);

  return (
    <>
      <p className="mb-1 text-sm font-medium uppercase tracking-wide text-emerald-700">{club.nombre}</p>
      <Titulo sub="Tus clases y los eventos del club">Calendario</Titulo>
      <Link href={`/c/${slug}/socio`} className="mb-4 inline-block text-sm text-emerald-700 underline">
        ← Volver a mi cuenta
      </Link>
      <Card>
        <NavegacionMes periodo={periodo} base={`/c/${slug}/socio/calendario`} />
        <CalendarioMes periodo={periodo} items={items} hoy={inicioDelDia()} />
      </Card>
    </>
  );
}
```

- [ ] **Step 2: "Próximos 7 días" en la home del socio**

En `src/app/c/[slug]/socio/page.tsx`:
- Agregar los imports:

```tsx
import { DIA_MS, inicioDelDia } from "@/lib/periodo";
import { AgendaLista } from "@/modules/calendario/components/AgendaLista";
import { calendarioSocio } from "@/modules/calendario/service";
```

- Antes del `Promise.all`, agregar `const hoy = inicioDelDia();` y reemplazar el `Promise.all` por:

```tsx
  const [socio, actividades, cuenta, agenda, msg] = await Promise.all([
    obtenerSocio(club.id, user.socioId!),
    actividadesParaSocio(club.id, user.socioId!),
    cuentaSocio(club.id, user.socioId!),
    calendarioSocio(club.id, user.socioId!, hoy, new Date(hoy.getTime() + 6 * DIA_MS)),
    searchParams,
  ]);
```

- Inmediatamente antes de `<div className="lg:col-span-3">` (el que contiene la card "Cuenta corriente"), agregar:

```tsx
        <div className="lg:col-span-3">
          <Card title="Próximos 7 días">
            <AgendaLista items={agenda} vacio="No tenés clases ni eventos en los próximos 7 días." />
            <Link href={`/c/${slug}/socio/calendario`} className="mt-4 inline-block text-sm text-emerald-700 underline">
              Ver calendario
            </Link>
          </Card>
        </div>
```

- [ ] **Step 3: Verificar y commitear**

```bash
npm run typecheck
npm test
git add -A src
git commit -m "Agrega el calendario del socio y sus próximos 7 días

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Seed, documentación, verificación final y demo

**Files:**
- Modify: `prisma/seed.ts`, `README.md`

- [ ] **Step 1: Seed con excepciones y eventos**

En `prisma/seed.ts`:
- Agregar los imports `import { DIA_MS, inicioDelDia } from "../src/lib/periodo";` y `import { clasesEnRango } from "../src/modules/calendario/reglas";`.
- Al final de `main()`, antes del `console.log`, agregar:

```ts
  // Calendario: una clase de Natación suspendida y una de Fútbol reprogramada dentro de los
  // próximos 7 días, un evento para todo el club y otro solo para Natación.
  const hoyDia = inicioDelDia();
  const proximaClase = (a: { diaSemana: number; createdAt: Date }) =>
    clasesEnRango(a, hoyDia, new Date(hoyDia.getTime() + 6 * DIA_MS))[0];
  await prisma.excepcionClase.create({
    data: { clubId: club.id, actividadId: natacion.id, fecha: proximaClase(natacion), tipo: "SUSPENDIDA", motivo: "Feriado" },
  });
  const futbolOriginal = proximaClase(futbol);
  await prisma.excepcionClase.create({
    data: {
      clubId: club.id, actividadId: futbol.id, fecha: futbolOriginal, tipo: "REPROGRAMADA",
      nuevaFecha: new Date(futbolOriginal.getTime() + DIA_MS), nuevaHora: "19:00", motivo: "Cancha ocupada",
    },
  });
  await prisma.evento.create({
    data: {
      clubId: club.id, titulo: "Asamblea anual", fecha: new Date(hoyDia.getTime() + 3 * DIA_MS), hora: "20:00",
      lugar: "Sede social", descripcion: "Balance y elección de autoridades",
    },
  });
  await prisma.evento.create({
    data: {
      clubId: club.id, titulo: "Clínica de natación", fecha: new Date(hoyDia.getTime() + 5 * DIA_MS), hora: "10:00",
      lugar: "Pileta", actividadId: natacion.id,
    },
  });
```

(`natacion` y `futbol` son las actividades ya creadas en el seed; `createdAt` es "ahora", así que la clase de hoy queda incluida.)

Run: `npm run db:seed`
Expected: `Seed OK. ...`.

- [ ] **Step 2: README**

En `## Funcionalidades`, en la fila **Admin de club**, después de `actividades con cupo y arancel mensual`, agregar ` · calendario: suspender o reprogramar clases y publicar eventos`. En la fila **Socio**, agregar al final ` · ver su calendario y los próximos 7 días`. En `## Estructura`, la línea de `modules/` pasa a terminar en `cuenta-corriente, pagos-online, calendario`.

- [ ] **Step 3: Verificación completa**

Con el servidor de desarrollo detenido:

```bash
npm run typecheck && npm run test:unit && npm run test:int && npm run build
TZ=UTC npm test
npx prisma migrate status
npm run db:seed
```

Expected: todo en verde (local y `TZ=UTC`); en la salida del build aparecen `/c/[slug]/admin/calendario` y `/c/[slug]/socio/calendario`; `migrate status` "Database schema is up to date!".

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts README.md
git commit -m "Suma clases suspendidas, reprogramadas y eventos al seed y documenta el calendario

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Checkpoint humano: flujo de demo (criterio de aceptación del spec)**

Levantar `npm run dev` y pedirle a la persona que recorra el flujo con `DEMO_LOGIN=true`:

1. `admin@demo.club` → **Calendario**: ve el mes con las clases recurrentes, la Natación suspendida ("Feriado"), el Fútbol movido y reprogramado, y los dos eventos.
2. Suspende una clase de Yoga (sábado) con "Lluvia" y reprograma una de Natación al día siguiente a las 20:00.
3. `socio@demo.club` (Lucía, inscripta en Natación) ve en **"Próximos 7 días"** la Natación suspendida por el seed ("Feriado"), la Asamblea y la Clínica. En **Ver calendario** ve la Natación reprogramada en el paso 2 (como movida en la fecha original y en la nueva) y no ve Yoga.
4. El admin restablece la clase de Yoga y crea un evento para todo el club, que aparece en el calendario de Lucía.
