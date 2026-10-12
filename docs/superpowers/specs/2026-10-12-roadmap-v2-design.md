# Roadmap v2 — Gestión de Socios

Fecha: 2026-10-12 · Estado: aprobado (orden y alcance de etapas)

## Objetivo

Iterar la v1 (gestión de socios multi-tenant) hacia una v2 más completa, manteniendo la arquitectura (Next.js App Router + Prisma/Postgres + NextAuth JWT, multi-tenant por `clubId`) y la estética actual, y modularizando el código por dominio.

**Contexto asumido:** proyecto académico (TP Final IISAIA, FIUBA) orientado a demo. Los pagos son **simulados** (sin pasarela real).

## Punto de partida (v1)

- Código organizado por capa técnica: `src/server/*` (servicios), `src/lib/*` (guards, validación, permisos), `src/app/c/[slug]/{admin,socio}`.
- Esquema aplicado con `prisma db push` (sin historial de migraciones).
- Tests: solo unitarios de funciones puras (permisos, validación, período).
- Limitaciones relevantes para v2:
  - `Pago` tiene `@@unique([socioId, periodo])`: un único pago por mes y solo de cuota social. No hay cuenta corriente ni deuda; "al día" se calcula por existencia del pago.
  - `Actividad` es solo recurrente semanal (`diaSemana` + `hora`), sin ocurrencias con fecha.
  - El tenant se resuelve por ruta (`/c/[slug]`).

## Etapas

Cada etapa tiene su propio ciclo **spec → plan → implementación** y se cierra con tests en verde y la demo funcionando.

| # | Etapa | Depende de | Spec |
|---|---|---|---|
| 0 | Base: migraciones, tests de servicios, modularización | — | [etapa-0](2026-10-12-etapa-0-base-design.md) |
| 1 | Cuenta corriente + pago simulado | 0 | pendiente |
| 2 | Calendario de actividades | 0 | pendiente |
| 3 | Notificaciones (admin general, club, socios) | 1, 2 | pendiente |
| 4 | Reportes con Tremor (por club y global) | 1, 2 | pendiente |
| 5 | Subdominio por club (detrás de flag) | 0 | pendiente |

### 0 — Base

Sin cambios de comportamiento. Pasar de `db push` a `prisma migrate` (Neon se recrea desde migraciones + seed; usa `directUrl` para migrar), sumar tests de integración de servicios contra Postgres real y reorganizar el código en `src/modules/<dominio>`. Detalle en su spec.

### 1 — Cuenta corriente + pago simulado

- Ledger de movimientos por socio: **cargos** (cuota social del período, cuota de actividad) y **pagos** (créditos). Saldo = suma de movimientos.
- Las actividades pasan a poder tener precio (arancel mensual opcional).
- El socio ve su cuenta corriente y paga uno o más cargos con un **checkout simulado** (aprobado/rechazado), que acredita en la cuenta corriente del club.
- El admin ve la cuenta corriente del club y de cada socio; sigue pudiendo registrar pagos manuales.
- Migración de datos: los `Pago` existentes se convierten en movimientos.

Preguntas abiertas: generación de cargos (automática al inicio de mes vs. al consultar), imputación de pagos parciales, diseño del medio simulado (tarjeta ficticia / "billetera" demo), si el estado "al día" pasa a ser saldo ≤ 0.

### 2 — Calendario de actividades

- Ocurrencias con fecha generadas a partir de la regla recurrente, más eventos puntuales.
- Cancelación/reprogramación de una ocurrencia.
- Vista de calendario (semana/mes) para admin y socio.

Preguntas abiertas: ocurrencias materializadas en tabla vs. calculadas; si la inscripción sigue siendo a la actividad o pasa a ser por ocurrencia; asistencia.

### 3 — Notificaciones

- Bandeja in-app por usuario (no leídas, marcar leída), para los tres roles.
- Disparadas por eventos de dominio de las etapas 1 y 2 (pago acreditado, vencimiento, clase cancelada, cupo liberado) y avisos manuales del admin de club (a todos / por actividad) y del admin general (a admins de club).

Preguntas abiertas: email además de in-app (opcional), preferencias por usuario, cómo se emiten los eventos (llamada directa desde servicios vs. bus simple en proceso).

### 4 — Reportes con Tremor

- Reporte del club: recaudación por mes, morosidad, ocupación de actividades, altas/bajas.
- Reporte global (admin general): clubes, socios activos, recaudación agregada.
- **Librería:** `@tremor/react` v3 requiere Tailwind 3 y React 18; el proyecto usa Tailwind 4 + React 19. Se usará **Tremor Raw** (componentes copiados al repo, sobre Recharts, compatibles con Tailwind 4). A confirmar versión al iniciar la etapa.

Preguntas abiertas: export CSV, rangos de fechas, si los agregados se calculan en consulta o con vistas.

### 5 — Subdominio por club

- Dominio registrado: `clubdesocios.com.ar`. Objetivo: `miclub.clubdesocios.com.ar`.
- Se implementa completo pero detrás de un flag `TENANT_MODE=path|subdomain`: un middleware resuelve el tenant por host y reescribe internamente a `/c/[slug]`; con `path` todo sigue como hoy.
- En desarrollo se prueba con `miclub.localhost:3000` (los navegadores resuelven `*.localhost` sin DNS).
- Pendiente de infraestructura: DNS wildcard y dominio en Vercel (verificar si el plan Hobby lo permite apuntando los nameservers a Vercel), cookie de NextAuth con dominio `.clubdesocios.com.ar`, `allowedOrigins` de Server Actions.

## Decisiones tomadas

1. Orden de etapas: 0 → 1 → 2 → 3 → 4 → 5.
2. Pagos simulados; el modelo debe permitir enchufar una pasarela real después.
3. Subdominios detrás de flag hasta contar con los ambientes.
4. Reportes con Tremor (variante compatible con Tailwind 4).
5. Tests de integración contra Postgres real (no Prisma mockeado).
6. Se mantienen la estética (`src/components/ui.tsx`) y los patrones existentes (`ejecutar`, `requireClub`, `apiClub`, servicios que reciben `clubId`).
