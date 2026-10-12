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

| # | Etapa | Depende de | Spec | Estado |
|---|---|---|---|---|
| 0 | Base: migraciones, tests de servicios, modularización | — | [etapa-0](2026-10-12-etapa-0-base-design.md) | ✅ Cerrada (rama `mvp2`) |
| 1 | Cuenta corriente + pago simulado | 0 | [etapa-1](2026-10-12-etapa-1-cuenta-corriente-design.md) | ✅ Cerrada (rama `mvp2`) |
| 2 | Calendario de actividades | 0 | [etapa-2](2026-10-12-etapa-2-calendario-design.md) | ✅ Cerrada (rama `mvp2`) |
| 3 | Notificaciones (admin general, club, socios) | 1, 2 | pendiente | Siguiente |
| 4 | Reportes con Tremor (por club y global) | 1, 2 | pendiente | — |
| 5 | Subdominio por club (detrás de flag) | 0 | pendiente | — |

### 0 — Base

Sin cambios de comportamiento. Pasar de `db push` a `prisma migrate` (Neon se recrea desde migraciones + seed; usa `directUrl` para migrar), sumar tests de integración de servicios contra Postgres real y reorganizar el código en `src/modules/<dominio>`. Detalle en su spec.

### 1 — Cuenta corriente + pago simulado

Diseño cerrado (ver spec). Resumen:

- Tres niveles: cuenta corriente del socio (cargos + pagos), cuenta del club (acreditaciones, derivada de los pagos) y vista de solo lectura del admin general por club + consolidado. La plataforma solo observa (sin liquidaciones ni comisiones por ahora).
- Cargos de cuota social y de arancel de actividad, generados por botón del admin (idempotente); al inscribirse con el período ya generado se crea el cargo del mes completo; cancelar anula el pendiente.
- Se pagan cargos completos elegidos, online (pasarela simulada con tarjetas de prueba detrás de la interfaz `Pasarela`; Mercado Pago como esqueleto) o en ventanilla.
- "Al día" = sin cargos vencidos impagos; día de vencimiento configurable por club (1–28, default 10).
- Sin migración de datos: Neon solo tiene datos del seed; se rehace el seed con un escenario de demo.

### 2 — Calendario de actividades

Diseño cerrado (ver spec). Resumen:

- Agenda con excepciones: las clases se calculan desde la regla semanal; se guardan solo las suspensiones/reprogramaciones (`ExcepcionClase`) y los eventos puntuales (`Evento`).
- La inscripción sigue siendo mensual a la actividad; sin reservas por clase ni asistencia. Las suspensiones no afectan el cobro.
- Eventos solo informativos, para todo el club o para los inscriptos de una actividad.
- Vista mensual y agenda (admin con gestión de excepciones y eventos; socio en lectura + "Próximos 7 días"), sin librería de calendario.

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

## Estado de integración

Al 2026-10-12, las etapas 0–2 están en la rama `mvp2` (sin mergear a `main`). Para publicarlas:

1. `npm run build` y la demo de cada etapa en local.
2. Neon: reset desde migraciones (ver README, "Pasaje a migraciones"): `0_init`, `cuenta_corriente`, `calendario`, `actividad_creada`, `actividad_creada_backfill`; luego `db:seed`.
3. Vercel: `DIRECT_URL` y `PASARELA="simulada"` (el Ignored Build Step para ramas distintas de `main` ya está configurado).
4. PR de `mvp2` a `main` → deploy. Probar después de las 21 h (zona horaria).

### Pendientes conocidos de la etapa 2 (no bloqueantes)

Casos que el spec no define y quedaron con el comportamiento actual: no se puede restablecer una clase reprogramada cuya fecha original ya pasó; una reprogramación puede superponerse con otra clase; los eventos de actividades desactivadas siguen visibles; se acepta reprogramar a hoy en una hora ya pasada.
