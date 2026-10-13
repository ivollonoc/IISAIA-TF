# Etapa 8 — Subdominios con URLs limpias: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** en modo `subdomain` cada club se usa en `<slug>.<ROOT_DOMAIN>/admin/…` y `/socio/…` (sin `/c/<slug>`), en local (`demo.localhost:3000`) y publicado (`demo.clubdesocios.com.ar`); en modo `path` todo sigue igual.

**Spec:** [roadmap-v3, etapa 8](../specs/2026-10-12-roadmap-v3-design.md#etapa-8--subdominios) · Rama: `mvp4` (sale de `main` = `mvp3`)

## Decisiones de esta etapa

- Ruling: las URLs visibles son absolutas en modo `subdomain` (`urlClub` → `https://demo.<root>/admin`). Next trata como navegación interna una URL absoluta del mismo origen, y así sirven igual para links dentro del club y para saltar desde el dominio raíz. Costo si está mal: links absolutos en los previews si alguien pone `TENANT_MODE` en Preview (por eso va solo en Production).
- Ruling: el middleware resuelve el host con `x-forwarded-host` antes que `host`. El redirect de un Server Action se renderiza con un fetch interno que lleva esos headers, así que reescribe al club correcto. Si el fetch interno falla, Next hace el redirect en el cliente, que también funciona.
- Ruling: en la página de un club, un email de otro club recibe la misma respuesta genérica que uno no registrado (no "Ese email no pertenece a <club>"), para no revelar emails. Costo si está mal: un mensaje de error.
- Las rutas internas no cambian (`/c/[slug]/…`, `revalidatePath`, links guardados en notificaciones).

## Tasks

### Task 1: Resolución de tenant y URLs (`src/lib/tenant.ts`)
- `configTenant()` lee `TENANT_MODE` y `ROOT_DOMAIN`; `urlClub(slug, ruta, cfg = configTenant())`; `urlVisible(ruta, cfg = configTenant())` traduce `/c/<slug>[/…][?…]` y deja igual el resto.
- `decidirRuta(host, ruta, root, { navegacion })` según el spec: subdominio → reescribe a `/c/<slug><ruta>`, salvo compartidas; `/c/<slug>/…` en navegación → redirige a la URL limpia; raíz igual que antes.
- `middleware.ts`: host = `x-forwarded-host ?? host`.
- `next.config.ts`: `env: { TENANT_MODE, ROOT_DOMAIN }` para que lleguen a los componentes cliente.
- Tests: reescribir `tests/unit/tenant.test.ts` con los casos del spec (RED con el comportamiento actual, GREEN después).

### Task 2: Links y redirecciones con `urlClub`
- `ejecutar`: `revalidatePath(<interna>)` y `redirect(urlVisible(destino))`.
- `homePath` (permisos) → `urlClub`; `redirect(...)` en páginas y en `socio.actions.ts`/`pagos-online/actions.ts` → `urlVisible`/`urlClub`.
- Todos los `href`/`action` con `` `/c/${slug}…` `` en `src/app` y `src/modules/*/components` → `urlClub(slug, "…")`. `base` de layouts, agenda, reportes y calendario → `urlClub`.
- Notificaciones: `linkInterno` devuelve `urlVisible(link)`; el pie de los mails usa la URL absoluta del club.
- Tests: `permisos.test.ts` (homePath en ambos modos), `action.test.ts` si cubre el redirect; `npm test` completo.

### Task 3: Links por mail al subdominio del club
- `linkDe(token, slug?)`: con `TENANT_MODE=subdomain` y usuario de club → `urlClub(slug, "/ingresar/<token>")`; si no, `APP_URL`.
- Tests de integración en `acceso.test.ts`: con modo subdominio el link de un socio apunta a `http(s)://<slug>.<root>/ingresar/…`.

### Task 4: Documentación y verificación
- README (local con subdominios; Vercel y NIC.ar) y `.env.example`.
- `npm run typecheck`, `npm test`, `npm run build`.
- Prueba manual en local: `TENANT_MODE=subdomain ROOT_DOMAIN=localhost:3000 npm run dev`, entrar como admin y socio demo en `demo.localhost:3000`, navegar pestañas, ejecutar una acción (alta de socio, reserva) y ver que la URL queda limpia y la sesión se mantiene.
