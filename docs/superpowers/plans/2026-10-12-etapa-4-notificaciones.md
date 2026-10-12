# Etapa 4 — Notificaciones: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** avisos in-app (bandeja + banner + campana) para los tres roles, mail y SMS simulados según los canales del club, disparados por eventos de dominio y por avisos manuales.

**Architecture:** módulo `src/modules/notificaciones`: `canales.ts` (in-app, mail simulado/Resend, SMS simulado), `destinatarios.ts`, `emitir.ts` (`notificar(clubId, evento)` arma el mensaje, resuelve destinatarios y canales; nunca lanza) y `service.ts` (bandeja, avisos manuales, buzón). Los servicios de dominio llaman a `notificar` después de confirmar su transacción.

**Tech Stack:** Next.js 15, Prisma 6 + Postgres, Zod, Vitest.

**Spec:** [roadmap-v3, etapa 4](../specs/2026-10-12-roadmap-v3-design.md#etapa-4--notificaciones)

## Global Constraints

- In-app siempre; mail y SMS solo si el club los activó (`Club.canales`) y el destinatario tiene email/teléfono.
- Mail real solo con `RESEND_API_KEY` y `EMAIL_FROM`; si no, `MensajeSaliente` con proveedor `simulado`. SMS siempre simulado.
- `notificar` nunca rompe la operación que lo dispara (captura y registra el error).
- Solo socios activos reciben avisos de socio. Toda consulta filtra por `clubId`.
- Links de notificaciones: rutas internas que empiezan con `/` (se valida al abrir).

## Review Focus

1. Pago online aprobado → aviso al socio una sola vez (no en el intento rechazado) (Task 2).
2. Generar cargos dos veces → la segunda no vuelve a avisar (solo cargos nuevos) (Task 2).
3. Cancelar una inscripción de una actividad que no estaba llena → no avisa a la lista de espera (Task 2).
4. Abrir una notificación con un link externo manipulado → no redirige afuera (Task 4).
5. Un canal que falla (Resend caído) → el resto de los canales y la operación siguen (Task 1).

---

### Task 1: Modelo, canales y `notificar`

**Files:** `prisma/schema.prisma`, migración `20261013110000_notificaciones`, `src/modules/notificaciones/{eventos,canales,destinatarios,emitir}.ts`, `tests/integration/notificaciones-emitir.test.ts`, factories.

**Interfaces:**
- Modelos `Notificacion`, `MensajeSaliente`, enum `CanalAviso { IN_APP EMAIL SMS }`, `Club.canales CanalAviso[] @default([IN_APP])`, `Socio.telefono String?`.
- `type EventoAviso` (union por `tipo`): `PAGO_ACREDITADO {socioId, monto}`, `CARGOS_GENERADOS {periodo, socios: {socioId, monto, vencimiento}[]}`, `CLASE_SUSPENDIDA {actividadId, fecha, hora, motivo}`, `CLASE_REPROGRAMADA {…, nuevaFecha, nuevaHora}`, `CLASE_RESTABLECIDA {actividadId, fecha, hora}`, `ACTIVIDAD_NUEVA {actividadId}`, `ACTIVIDAD_EDITADA {actividadId}`, `EVENTO_NUEVO {eventoId}`, `EVENTO_CANCELADO {titulo, fecha, hora, actividadId|null}`, `LUGAR_LIBERADO {actividadId}|{eventoId}`, `AVISO_CLUB {asunto, mensaje, actividadId|null}`.
- `notificar(clubId: string, evento: EventoAviso): Promise<void>`; `notificarAdmins({ asunto, mensaje, clubId: string|null }): Promise<void>`.
- `interface Destinatario { usuarioId: string|null; email: string|null; telefono: string|null }`.
- `canalesActivos(club): CanalAviso[]`, `getProveedorEmail(): "resend"|"simulado"`.

- [ ] Tests: evento a todos los socios activos (no inactivos, no otro club) crea una Notificacion por usuario; sin usuario no hay in-app; con EMAIL activo crea MensajeSaliente con el email; con SMS y teléfono crea SMS; sin canales extra solo in-app; un canal que lanza no impide los demás ni lanza.
- [ ] Implementar. Commit.

### Task 2: Eventos de dominio

**Files:** `cuenta-corriente/{pagos,cargos}.service.ts`, `pagos-online/checkout.service.ts`, `calendario/{service,eventos.service}.ts`, `actividades/service.ts`; test `tests/integration/notificaciones-eventos.test.ts`.

- [ ] Tests (uno por evento): pago en ventanilla y online aprobado → "Pago acreditado"; rechazado → nada; generar cargos → aviso a cada socio con cargos nuevos con monto y vencimiento, segunda generación → nada; suspender/reprogramar/restablecer → inscriptos; actividad nueva → todos; editar horarios o fechas → inscriptos (editar solo el nombre → nada); subir el cupo con lista de espera → lista de espera; evento nuevo → todos o inscriptos de la actividad; evento eliminado → misma audiencia; cancelar en actividad/evento lleno → lista de espera (no lleno → nada).
- [ ] Implementar llamando `notificar` después de cada transacción. Commit.

### Task 3: Bandeja, avisos manuales y buzón

**Files:** `notificaciones/{service,schema,actions}.ts`; `clubs/service.ts` (`actualizarCanales`); test `tests/integration/notificaciones-bandeja.test.ts`.

**Interfaces:** `listarNotificaciones(usuarioId, limite=50)`, `contarNoLeidas(usuarioId)`, `ultimasNoLeidas(usuarioId, n=3)`, `marcarLeida(usuarioId, id) → link|null`, `marcarTodasLeidas(usuarioId)`, `enviarAvisoClub(clubId, input)`, `enviarAvisoPlataforma(input)`, `buzonSalida(clubId|null, limite=50)`, `actualizarCanales(clubId, input)`.

- [ ] Tests: orden y no leídas; marcar leída solo las propias; link externo → null; aviso de club a todos / a una actividad; aviso de plataforma a todos los admins o a los de un club; canales (IN_APP siempre presente); buzón aislado por club.
- [ ] Implementar. Commit.

### Task 4: Pantallas

**Files:** `src/components/{Header,BannerAvisos}.tsx`, `src/app/avisos/page.tsx`, `src/app/c/[slug]/admin/avisos/page.tsx` (+ pestaña), `src/app/admin/avisos/page.tsx` (+ link), `socios/{schema,components/SocioForm}.tsx` (teléfono).

- [ ] Banner bajo el header con la última no leída ("y N más") y link a Avisos; campana con contador en el header; bandeja `/avisos` (abrir = marcar leída y navegar; "Marcar todas").
- [ ] Admin club: pestaña Avisos (aviso manual, canales, buzón de salida). Admin general: `/admin/avisos` (aviso a admins, buzón global).
- [ ] Typecheck, build, navegador. Commit.

### Task 5: Seed y README

- [ ] Club demo con canales IN_APP+EMAIL, teléfonos en algunos socios, avisos de ejemplo para Lucía (cargos del mes, lugar liberado). README. Commit.
