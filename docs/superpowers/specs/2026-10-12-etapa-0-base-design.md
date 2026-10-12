# Etapa 0 — Base: migraciones, tests de servicios y modularización

Fecha: 2026-10-12 · Estado: diseño aprobado · Roadmap: [roadmap-v2](2026-10-12-roadmap-v2-design.md)

## Objetivo

Dejar la app **haciendo exactamente lo mismo que hoy**, pero preparada para que las etapas 1–5 sumen modelos y módulos sin riesgo:

- cambios de esquema versionados y reproducibles en todos los ambientes;
- una red de tests que fije el comportamiento actual de los servicios;
- código organizado por dominio.

**Fuera de alcance:** funcionalidades nuevas, cambios visuales, cambios de esquema (salvo la migración inicial equivalente al esquema actual).

## Orden de trabajo

0.a migraciones → 0.b tests de servicios (contra el código actual) → 0.c modularización (con los tests como red). Cada sub-etapa en commits separados.

## 0.a — De `prisma db push` a `prisma migrate`

**Motivo:** la etapa 1 modifica tablas con datos (`Pago`) y requiere migración de datos. `db push` no deja historial ni permite SQL de migración revisable.

Pasos:

1. Generar `prisma/migrations/0_init/migration.sql` desde el esquema actual:
   `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql`
   (más `prisma/migrations/migration_lock.toml` con `provider = "postgresql"`).
2. Scripts en `package.json`:
   - `db:migrate` → `prisma migrate dev` (desarrollo, crea migraciones nuevas)
   - `db:deploy` → `prisma migrate deploy` (CI, contenedores, producción)
   - se elimina `db:push`.
3. Reemplazar `prisma db push` por `prisma migrate deploy` en:
   - `.github/workflows/ci.yml`
   - `.devcontainer/devcontainer.json` (`postCreateCommand`)
   - `docker-compose.yml` (`command` del servicio `app`)
   - `README.md` (opción C y sección Deploy)
4. **Baseline en Neon** (paso manual, único delicado): las tablas ya existen, así que se marca `0_init` como aplicada sin ejecutarla:
   `DATABASE_URL=<neon> npx prisma migrate resolve --applied 0_init`
   y se verifica con `npx prisma migrate status` (sin pendientes). Documentado en el README.
5. Bases locales existentes creadas con `db push`: se recrean (`prisma migrate reset`) o se les aplica el mismo baseline. Documentado en el README.

**Vercel:** no se ejecuta `migrate deploy` en el build, porque los deploys de preview comparten `DATABASE_URL` con producción y migrarían prod desde cualquier rama. Se mantiene el paso explícito `npm run db:deploy`. Se automatiza cuando existan bases por ambiente.

## 0.b — Tests de integración de servicios (Postgres real)

### Infraestructura

- Base `gestion_socios_test` en el mismo Postgres de `docker-compose` (dev usa `gestion_socios`).
- `.env.test` (versionado, solo URL local): `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gestion_socios_test`.
- **Guard de seguridad:** el setup aborta si `DATABASE_URL` no termina en `_test`, para no truncar nunca Neon ni la base de dev.
- Vitest con dos proyectos:
  - `unit`: `tests/unit/**/*.test.ts`, en paralelo, sin base.
  - `integration`: `tests/integration/**/*.test.ts`, carga `.env.test`, `globalSetup` que corre `prisma migrate reset --force --skip-seed` una vez por corrida (valida también que las migraciones aplican desde cero), `fileParallelism: false`.
- Helpers:
  - `tests/helpers/db.ts` → `resetDb()`: `TRUNCATE ... RESTART IDENTITY CASCADE` de todas las tablas de `public` excepto `_prisma_migrations`. Se llama en `beforeEach`.
  - `tests/helpers/factories.ts` → `crearClub()`, `crearTipo()`, `crearSocio()`, `crearActividad()` con valores por defecto sobreescribibles. Los tests no dependen del seed.
- Los tests actuales (`permisos`, `periodo`, `validation`) se mueven a `tests/unit/` sin cambios.
- Scripts: `test` (ambos proyectos), `test:unit`, `test:int`.
- CI: el paso de tests usa la `DATABASE_URL` de test (el `globalSetup` crea y migra la base); typecheck/build/seed siguen sobre la base principal migrada con `migrate deploy`.

### Casos mínimos

| Servicio | Casos |
|---|---|
| clubs | crear club + usuario ADMIN_CLUB; slug duplicado rechazado; email usado por un SOCIO/SUPERADMIN rechazado; email que ya administra otro club rechazado; ADMIN_CLUB sin club se reasigna al nuevo club |
| tipos | crear y listar por club; nombre duplicado en el mismo club rechazado y permitido en otro club |
| socios | alta con nro de socio correlativo por club; tipo de socio de otro club rechazado; con email crea/vincula usuario SOCIO; email de otro club o rol rechazado; DNI duplicado en el club rechazado; mismo DNI en otro club permitido; actualizar; baja/alta lógica; `obtenerSocio` de otro club no encontrado |
| pagos | registrar; período duplicado rechazado; socio de otro club rechazado; `resumenClub` (activos, al día, morosos, recaudado, actividades) |
| actividades | crear y listar ordenado; inscribir; doble inscripción rechazada; socio inactivo rechazado; cupo agotado rechazado; cancelar; cancelar sin inscripción rechazado; `actividadesParaSocio` marca inscripto y cuenta inscriptos |
| concurrencia | N inscripciones simultáneas (`Promise.allSettled`) a una actividad con cupo 1 → exactamente 1 éxito e inscriptos final = 1; los rechazos son `DomainError` ("No hay cupo") o conflicto de serialización (P2034, ya traducido en `mensajeDeError`) |
| aislamiento | cada servicio invocado con el `clubId` de otro club no lee ni modifica datos ajenos |

Se testea el comportamiento **actual**. Si algún test revela un defecto (p. ej. en concurrencia), se registra como hallazgo y se corrige en un commit separado e identificado; es el único cambio de comportamiento admitido en la etapa.

## 0.c — Modularización por dominio

Estructura destino:

```
src/modules/
  clubs/        service.ts · schema.ts · actions.ts
  cuotas/       tipos.service.ts · pagos.service.ts · schema.ts · actions.ts
  socios/       service.ts · schema.ts · actions.ts · components/SocioForm.tsx
  actividades/  service.ts · schema.ts · actions.ts
src/lib/        transversal: auth, session, permisos, db, errors, action, api, format, periodo
                validation.ts → solo helpers comunes (texto, entero, emailOpcional)
src/components/ UI base compartida (ui.tsx, Header, Tabs, LogoutButton) — sin cambios
src/app/        rutas y páginas livianas que importan de src/modules/*
```

Mapeo:

| Hoy | Destino |
|---|---|
| `src/server/clubs.ts` | `modules/clubs/service.ts` |
| `src/server/tipos.ts` | `modules/cuotas/tipos.service.ts` |
| `src/server/pagos.ts` | `modules/cuotas/pagos.service.ts` |
| `src/server/socios.ts` | `modules/socios/service.ts` |
| `src/server/actividades.ts` | `modules/actividades/service.ts` |
| esquemas de `src/lib/validation.ts` | `schema.ts` de cada módulo |
| `src/app/admin/actions.ts` | `modules/clubs/actions.ts` |
| `src/app/c/[slug]/admin/actions.ts` | dividido en `cuotas`, `socios`, `actividades` |
| `src/app/c/[slug]/socio/actions.ts` | `modules/actividades/actions.ts` |
| `src/app/c/[slug]/admin/socios/SocioForm.tsx` | `modules/socios/components/SocioForm.tsx` |

Reglas:

- Los servicios siguen recibiendo `clubId` como primer parámetro y filtrando por él.
- Un módulo puede importar de `src/lib` y de otros módulos solo a través de su `service.ts`/`schema.ts` (no de `actions.ts`).
- `src/server/` desaparece. Las rutas de la app y de la API REST no cambian.
- Los imports de los tests se actualizan a los nuevos paths; los tests no cambian de contenido.

## Criterios de terminado

1. `npm run typecheck`, `npm run test:unit` y `npm run test:int` en verde local y en CI; `npm run build` ok.
2. `prisma migrate status` sin pendientes en Neon (baseline aplicado).
3. El código de negocio vive en `src/modules/*`; `src/server/` eliminado.
4. Flujo manual de demo de la propuesta funciona igual: admin general crea club → admin de club carga tipo, socio y pago → socio se inscribe hasta agotar cupo.
5. Sin cambios visuales.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Baseline mal aplicado en Neon | `migrate diff` entre Neon y el esquema antes del `resolve` (debe estar vacío); el paso se hace manualmente y se verifica con `migrate status` |
| Tests truncan una base que no es de test | guard por sufijo `_test` en el setup |
| Tests de integración lentos o inestables | ejecución serial, `resetDb` por test, factories sin dependencia del seed |
| Mover archivos rompe imports | modularización después de tener los tests; typecheck + build en cada commit |
