# Etapa 1 — Cuenta corriente y pago simulado

Fecha: 2026-10-12 · Estado: diseño aprobado · Roadmap: [roadmap-v2](2026-10-12-roadmap-v2-design.md) · Depende de: [etapa 0](2026-10-12-etapa-0-base-design.md)

## Objetivo

Que el socio vea qué debe, lo pague con un checkout simulado y el pago se refleje al instante en su estado, en la cuenta del club y en la vista del admin general.

**Criterio de éxito:** el flujo de demo descrito al final funciona de punta a punta con el seed, sin preparación manual.

## Decisiones

| # | Tema | Decisión |
|---|---|---|
| 1 | Alcance de "cuenta corriente" | Tres niveles: cuenta corriente del **socio** con el club (cargos y pagos), cuenta del **club** (acreditaciones de cobros) y vista del **admin general** sobre la cuenta de cada club + consolidado. |
| 2 | Rol de la plataforma | Solo observa (lectura). Sin liquidaciones ni comisiones en esta iteración; el modelo permite agregarlas sin migrar datos. |
| 3 | Generación de cargos | Botón del admin del club, idempotente, para el período actual o el siguiente. La función queda lista para que un cron la invoque más adelante. |
| 4 | Imputación de pagos | Se pagan **cargos completos elegidos** (online y en ventanilla). Sin pagos parciales ni saldo a favor. |
| 5 | Checkout | Pasarela simulada detrás de una interfaz `Pasarela`, con tarjetas de prueba. `PasarelaMercadoPago` queda como esqueleto. Selección por env `PASARELA=simulada\|mercadopago` (default `simulada`). La interfaz contempla `PENDIENTE` para MP. |
| 6 | "Al día" | Sin cargos **vencidos** impagos. Vencimiento = día `diaVencimiento` (configurable por club, 1–28, default 10) del mes del período. |
| 7 | Aranceles de actividades | `Actividad.arancel` mensual opcional (0 = gratuita). Inscribirse con cargos del período ya generados crea el cargo del mes completo (sin prorrateo); cancelar anula el cargo si está pendiente; pagado no se reintegra; reinscribirse reactiva el cargo anulado. |
| 8 | Datos existentes | Neon solo tiene datos del seed: no hay migración de datos de `Pago`. Migración de esquema + seed nuevo. |
| 9 | Anulación | El admin puede anular un cargo **pendiente** con motivo obligatorio. Sin bonificaciones ni ajustes. |
| 10 | Modelo | Cargos + pagos; la cuenta del club se **deriva** de los pagos (sin tabla de saldos ni ledger del club). |

## Modelo de datos

```prisma
enum MedioPago { EFECTIVO TRANSFERENCIA ONLINE OTRO }       // + ONLINE
enum ConceptoCargo { CUOTA ACTIVIDAD }
enum EstadoCargo { PENDIENTE PAGADO ANULADO }
enum EstadoIntento { APROBADO RECHAZADO PENDIENTE }

model Club {
  // ...
  diaVencimiento Int @default(10)   // 1..28
}

model Actividad {
  // ...
  arancel Int @default(0)           // pesos enteros por mes; 0 = gratuita
}

model Cargo {
  id              String        @id @default(cuid())
  clubId          String
  socioId         String
  concepto        ConceptoCargo
  actividadId     String?       // solo si concepto = ACTIVIDAD (onDelete: SetNull)
  clave           String        // "CUOTA" | "ACT:<actividadId>"
  descripcion     String        // "Cuota social 2026-10", "Natación 2026-10" (se conserva si se borra la actividad)
  periodo         String        // "YYYY-MM"
  monto           Int
  vencimiento     DateTime
  estado          EstadoCargo   @default(PENDIENTE)
  pagoId          String?
  motivoAnulacion String?
  createdAt       DateTime      @default(now())

  @@unique([socioId, periodo, clave])   // idempotencia (NULL en actividadId no sirve para UNIQUE)
  @@index([clubId, periodo])
  @@index([clubId, estado, vencimiento])
}

model Pago {
  id            String    @id @default(cuid())
  clubId        String
  socioId       String
  monto         Int                    // = suma de sus cargos
  medio         MedioPago
  fecha         DateTime  @default(now())
  registradoPor String?                // usuarioId del admin; null si ONLINE
  cargos        Cargo[]
  intento       IntentoPago?

  @@index([clubId, fecha])
}
// Se eliminan Pago.periodo y @@unique([socioId, periodo]).

model IntentoPago {
  id                String        @id @default(cuid())
  clubId            String
  socioId           String
  cargoIds          String[]
  monto             Int
  estado            EstadoIntento
  pasarela          String        // "simulada" | "mercadopago"
  referenciaExterna String?
  motivoRechazo     String?
  ultimos4          String?       // nunca se guarda el número completo ni el CVV
  pagoId            String?       @unique
  createdAt         DateTime      @default(now())

  @@index([clubId, estado])
}
```

Relaciones con `Club` y `Socio` como en el resto del esquema (`onDelete: Cascade`). Dinero en pesos enteros (`Int`), como en v1.

## Arquitectura

```
src/modules/cuenta-corriente/
  reglas.ts            puras: vencimiento(periodo, dia), estaAlDia(cargos, hoy), saldoAcumulado(movs)
  cargos.service.ts    generarCargosPeriodo(clubId, periodo) → {creados, existentes}
                       cargoPorInscripcion(tx, clubId, socioId, actividadId)
                       anularPorCancelacion(tx, clubId, socioId, actividadId)
                       anularCargo(clubId, cargoId, motivo)
  pagos.service.ts     registrarPago(clubId, {socioId, cargoIds, medio, registradoPor?}, tx?)
  consultas.service.ts cuentaSocio, cuentaClub, resumenClub, resumenPlataforma, estadoSocios
  schema.ts · actions.ts · components/ (CuentaSocio, CuentaClub, EstadoCargo)

src/modules/pagos-online/
  pasarela.ts          interface Pasarela { nombre; cobrar(intento, datos) → ResultadoPasarela }
                       ResultadoPasarela = {estado: APROBADO, referencia}
                                         | {estado: RECHAZADO, motivo}
                                         | {estado: PENDIENTE, referencia, redirectUrl?}
  simulada.ts          tarjetas de prueba
  mercadopago.ts       esqueleto: lanza "Pasarela Mercado Pago no implementada"; comentarios con lo
                       pendiente (credenciales, preference, redirect, webhook idempotente → estado PENDIENTE)
  index.ts             getPasarela() según env PASARELA
  checkout.service.ts  pagarOnline(clubId, socioId, cargoIds, datosTarjeta)
  schema.ts · actions.ts
```

**Dependencias:**

- `actividades` → `cuenta-corriente`: `inscribir`/`cancelarInscripcion` llaman a `cargoPorInscripcion`/`anularPorCancelacion` dentro de su misma transacción.
- `pagos-online` → `cuenta-corriente`: solo vía `registrarPago`.
- `cuenta-corriente` no conoce `pagos-online`.

**Cambios sobre v1:**

- `resumenClub` pasa de `cuotas` a `cuenta-corriente` y usa la regla nueva de "al día".
- El indicador "al día" del listado de socios y del área socio usa `estaAlDia` de `reglas.ts`; se elimina `estaAlDia` de `src/lib/periodo.ts` (se conserva `periodoActual`).
- El registro manual "por período" (`pagoSchema` con `periodo`) se reemplaza por el pago de cargos seleccionados.

## Flujos

### Generar cargos del período

`generarCargosPeriodo(clubId, periodo)`:

1. Solo acepta el período actual o el siguiente (`DomainError` si no).
2. Para cada socio **activo**: cargo `CUOTA` con la cuota de su tipo si es > 0; un cargo `ACT:<id>` por cada inscripción en actividad **activa** con arancel > 0.
3. `vencimiento` = `diaVencimiento` del club en el mes del período.
4. `createMany({ skipDuplicates: true })` apoyado en `UNIQUE(socioId, periodo, clave)`: idempotente y seguro ante ejecuciones paralelas.
5. Devuelve `{creados, existentes}`; la UI muestra "Se generaron N cargos (M ya existían)".

### Inscripción / cancelación

- **Inscribir** (transacción serializable existente): si el socio ya tiene el cargo `CUOTA` del período actual (es decir, los cargos del período fueron generados) y la actividad tiene arancel > 0, se crea el cargo `ACT:<id>` o, si existe `ANULADO`, se reactiva a `PENDIENTE` con el arancel vigente. Si no fueron generados, no se crea nada (lo hará la generación).
- **Cancelar** (transacción): borra la inscripción y anula el cargo del período actual de esa actividad si está `PENDIENTE` (motivo "Baja de actividad"). Si está `PAGADO`, no se toca.

### `registrarPago` (única vía para cancelar cargos)

En una transacción:

1. Al menos un cargo; todos del socio y del club.
2. Crea `Pago` con `monto` = suma de los cargos.
3. `updateMany({ where: { id: { in: cargoIds }, socioId, clubId, estado: PENDIENTE }, data: { estado: PAGADO, pagoId } })`.
4. Si `count !== cargoIds.length` → `DomainError("Alguno de los cargos ya fue pagado o anulado")` y rollback.

El paso 4 evita el doble pago (socio online + admin en ventanilla, o doble click).

### Pago manual (admin)

Detalle del socio → tilda cargos pendientes → elige medio (efectivo, transferencia, otro) → `registrarPago` con `registradoPor` = admin.

### Pago online (socio)

1. "Mi cuenta" → selecciona cargos → `/c/[slug]/socio/pagar?cargos=id1,id2`.
2. Formulario de tarjeta ficticia (número, vencimiento MM/AA, CVV, titular) validado con Zod. No se persisten número ni CVV; solo `ultimos4`.
3. `pagarOnline`:
   - revalida en servidor que los cargos sean del socio y estén `PENDIENTE`, y **calcula el monto en servidor**;
   - crea `IntentoPago` y llama a `getPasarela().cobrar(...)`;
   - **APROBADO** → `registrarPago(medio: ONLINE)`, vincula `pagoId` al intento → vuelve a "Mi cuenta" con "Pago aprobado";
   - **RECHAZADO** → intento con `motivoRechazo` → vuelve al checkout con el mensaje; deuda intacta;
   - **PENDIENTE** → intento `PENDIENTE` → mensaje "Pago en proceso" (no ocurre con la simulada).

**Tarjetas de prueba (simulada):** terminada en `0001` → aprobada; terminada en `0002` → rechazada ("Fondos insuficientes"); cualquier otra válida → aprobada. Se listan en el checkout en un recuadro "Modo de prueba".

### Anular cargo (admin)

Solo cargos `PENDIENTE`, motivo obligatorio. El cargo anulado sigue visible (tachado) en la cuenta.

### Errores

| Situación | Resultado |
|---|---|
| Cargo ya pagado/anulado o de otro socio | `DomainError` con mensaje claro |
| Pasarela rechaza | Mensaje en checkout; intento `RECHAZADO` guardado |
| Pasarela lanza excepción (p. ej. MP no implementado) | Intento `RECHAZADO` con "Error de la pasarela"; se loguea; mensaje genérico al socio |
| Pasarela aprueba pero `registrarPago` falla (carrera con el admin) | Intento `APROBADO` sin `pagoId`; visible al admin como "requiere revisión" (con pasarela real correspondería reintegro; documentado) |

## Pantallas

Con los componentes existentes de `src/components/ui.tsx` y la paleta actual (esmeralda/slate). Único componente nuevo: `EstadoCargo` (pendiente / vencido / pagado / anulado).

### Socio — `/c/[slug]/socio`

- Card "Mi cuenta" (reemplaza "Mi cuota"): badge "Al día" / "Con deuda vencida", saldo pendiente, próximo vencimiento, botón "Pagar".
- Card "Cuenta corriente" (reemplaza "Mis pagos"): movimientos con fecha, concepto, cargo, pago y saldo acumulado; checkbox en cargos pendientes y "Pagar seleccionados ($X)".
- Actividades: columna "Arancel" ("$5.000/mes" o "Gratis"); al inscribirse en una paga, el aviso indica el cargo agregado.
- Nueva `/c/[slug]/socio/pagar`: detalle de cargos y total a la izquierda, formulario de tarjeta y recuadro "Modo de prueba" a la derecha; rechazo vía `Aviso`.

### Admin de club — `/c/[slug]/admin`

- Nuevo tab "Cuenta corriente" (`/admin/cuenta`): stats del mes (cobrado, online, ventanilla, deuda pendiente, deuda vencida), tabla de acreditaciones (fecha, socio, medio, monto), botón "Generar cargos de {mes}" (selector actual/siguiente), aviso "Intentos aprobados sin pago vinculado (N)".
- Detalle del socio: su cuenta corriente reemplaza el historial; registrar pago de cargos tildados con medio; "Anular" con motivo en cada pendiente. Desaparece el formulario de pago por período.
- Listado de socios: badge con la regla nueva y columna "Deuda".
- Resumen: "Al día", "Morosos", "Deuda vencida" con la regla nueva.
- Actividades: campo y columna "Arancel mensual".
- Tipos de socio: se agrega la configuración "Día de vencimiento" del club (1–28).

### Admin general — `/admin`

- Tabla de clubes: columnas "Cobrado del mes" y "Deuda vencida" + link "Ver cuenta".
- Nueva `/admin/clubs/[slug]/cuenta`: solo lectura, reutiliza el componente `CuentaClub` sin acciones.
- Stats consolidados: cobrado del mes en la plataforma, deuda vencida total, socios morosos.

Nota: el `SUPERADMIN` sigue pudiendo operar en `/c/[slug]/admin` (comportamiento de v1, no se modifica); la vista de observación es la de `/admin`.

## Tests

Infraestructura de la etapa 0 (Vitest `unit` + `integration`, Postgres real, `resetDb`, factories + `crearCargo`, `crearPago`).

### Unitarios

| Unidad | Casos |
|---|---|
| `vencimiento(periodo, dia)` | día dentro del mes; día 28 en febrero; cambio de año |
| `estaAlDia(cargos, hoy)` | sin cargos; pendiente no vencido → al día; vencido → moroso; vence hoy → al día; pagados y anulados no cuentan |
| `saldoAcumulado(movs)` | orden por fecha; anulados no suman |
| `PasarelaSimulada` | `…0001` aprueba; `…0002` rechaza con motivo; otra aprueba |
| schemas | tarjeta (número, vencimiento futuro, CVV); arancel ≥ 0; `diaVencimiento` 1–28 |

### Integración

| Área | Casos |
|---|---|
| Generar cargos | cuota + aranceles de inscriptos; omite inactivos, cuota 0, actividades gratuitas/inactivas; idempotente (2ª corrida `creados: 0`); dos corridas paralelas sin duplicados; período pasado rechazado |
| Inscripción | con cargos generados crea cargo de arancel; sin generar no crea; cancelar anula pendiente; cancelar con pagado no lo toca; reinscribir reactiva anulado; fallo del cargo → sin inscripción (rollback) |
| `registrarPago` | N cargos, monto = suma; cargo pagado/anulado/de otro socio → rechazo sin cambios parciales; dos pagos concurrentes del mismo cargo → exactamente 1 éxito |
| Checkout | aprobado → cargos pagados, intento vinculado, medio ONLINE; rechazado → intento con motivo, deuda intacta; monto calculado en servidor; pasarela que lanza → intento rechazado; aprobado con cargo ya pagado → intento aprobado sin pago |
| Anular | solo pendientes; motivo obligatorio |
| Consultas | `cuentaSocio` con saldo acumulado; `resumenClub` (al día/morosos); `cuentaClub`; `resumenPlataforma` agrega todos los clubes |
| Aislamiento | todo servicio con `clubId` ajeno no lee ni modifica |

### Seed

Escenario de demo: dos meses de cargos generados; un socio al día, uno con deuda no vencida y uno moroso (cargo vencido del mes anterior); una actividad paga y una gratuita; pagos en efectivo y online.

## Flujo de demo (criterio de aceptación)

1. Admin del club genera los cargos del mes.
2. Socio ve su deuda y paga con tarjeta `…0002` → rechazado, deuda intacta.
3. Paga con `…0001` → aprobado, pasa a "Al día".
4. Admin ve la acreditación online en la cuenta del club.
5. Socio se inscribe en la actividad paga → aparece el cargo; cancela → cargo anulado.
6. Admin general ve el cobrado del club en el consolidado.

## Fuera de alcance

Liquidaciones y comisiones de la plataforma; pagos parciales y saldo a favor; prorrateo; bonificaciones; generación automática por cron; integración real con Mercado Pago; reintegros; notificaciones de vencimiento (etapa 3); reportes gráficos (etapa 4).
