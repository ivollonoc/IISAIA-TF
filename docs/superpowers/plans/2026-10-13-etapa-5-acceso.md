# Etapa 5 — Acceso: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** login en el home con un solo campo de email; usuarios demo sin contraseña, el resto con link mágico por mail; invitación por mail al crear un club o un socio; sin Google.

**Spec:** [roadmap-v3, etapa 5](../specs/2026-10-12-roadmap-v3-design.md#etapa-5--acceso)

## Decisiones de esta etapa

- Ruling: el spec decía que los links simulados se veían en el buzón de salida, pero ese buzón dejó de mostrarse (privacidad). Con mail simulado **y** `DEMO_LOGIN=true`, la pantalla "te mandamos un link" muestra el link para poder seguir la demo; en producción con Resend nunca se muestra.
- La URL absoluta de los mails sale de `APP_URL` (o `NEXTAUTH_URL`); si no hay, se usa la ruta relativa.
- "No revela si el email existe": la respuesta es la misma para un email registrado o no (salvo el link de demo, que solo aparece con mail simulado y modo demo).

## Tasks

### Task 1: Modelo y tokens
- `Usuario.demo Boolean @default(false)`, `TokenAcceso { id, usuarioId, hash @unique, tipo "LOGIN"|"INVITACION", expira, usadoAt?, createdAt }`.
- `src/modules/acceso/tokens.ts`: `crearToken(usuarioId, tipo, ahora?) → token` (32 bytes aleatorios en base64url; se guarda sha256), `consumirToken(token, ahora?) → usuario` (vencido, usado o inexistente → `DomainError("El link no es válido o ya venció")`). Login 15 min, invitación 7 días.
- Tests: hash (no se guarda el token), vencimiento, un solo uso.

### Task 2: Link mágico e invitaciones
- `solicitarLink(email, ahora?) → { link: string | null }`: si existe, crea token LOGIN y manda el mail (canal de mail, `MensajeSaliente`); si no, nada.
- `enviarInvitacion(usuarioId) → link`: token INVITACION + mail "Activá tu cuenta en <club>".
- `crearClub` invita al admin; `crearSocio`/`actualizarSocio` invitan cuando hay email nuevo. `reenviarInvitacionAction` en la ficha del socio.
- `autorizarDemo(email)` (solo `demo = true`) y `autorizarLink(token)` para NextAuth.
- Tests: link solo para registrados, un uso; invitación al crear club y socio; demo solo para usuarios demo.

### Task 3: Pantallas y auth
- `auth.ts`: providers `demo` (con `DEMO_LOGIN`) y `link`; sin Google ni alta automática del superadmin.
- Home: landing + formulario de email (`solicitarLinkAction`) + botones "Admin general / Admin del club / Socio" (demo). `/login` redirige al home. `/ingresar/[token]`: botón "Ingresar" que llama a `signIn("link")`.
- Seed: usuarios demo con `demo: true`. README y `.env.example`.
