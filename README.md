# Gestión de Socios — TP Final IISAIA

Trabajo final del curso **Introducción a la Ingeniería de Software con Inteligencia Artificial** (Especialización en IA, FIUBA).

App web multi-tenant para que clubes deportivos gestionen socios, cuotas y actividades, y para que cada socio se autogestione.

- Propuesta (problema, usuarios, MVP, stack): [docs/propuesta.md](docs/propuesta.md)
- Presentación v1: [docs/presentacion-v1.pptx](docs/presentacion-v1.pptx)
- Descripción original de la idea: [descripcion-app](descripcion-app)

## Funcionalidades

| Rol | Puede |
|---|---|
| Admin general | Crear clubes y asignar su administrador · ver lo cobrado y la deuda vencida de cada club y el consolidado · ver la cuenta de un club en solo lectura |
| Admin de club | Tipos de socio, cuotas y día de vencimiento · alta/modificación/baja de socios · actividades con cupo y arancel mensual · generar los cargos del mes · registrar pagos en ventanilla y anular cargos · cuenta corriente del club · tablero del mes |
| Socio | Ver su cuenta corriente y su estado (al día / con deuda vencida) · pagar cargos online · inscribirse/cancelar actividades (respeta cupo; las pagas suman su arancel) |

### Pagos online (simulados)

El checkout usa la pasarela configurada en `PASARELA` (por defecto `simulada`). Tarjetas de prueba: `4000 0000 0000 0001` (aprobada) y `4000 0000 0000 0002` (rechazada por fondos insuficientes), con cualquier vencimiento futuro y CVV de 3 dígitos. Nunca se guardan el número completo ni el CVV. La integración con Mercado Pago está preparada (`src/modules/pagos-online/mercadopago.ts`) pero no implementada.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · NextAuth (JWT, Google + login demo) · Prisma · PostgreSQL · Zod · Vitest

## Estructura

```
prisma/            schema.prisma, migrations/ (historial versionado) y seed.ts (datos demo)
src/
  app/             páginas y rutas (App Router): composición, sin lógica de negocio
    admin/         panel del admin general
    c/[slug]/      espacio de cada club: /admin y /socio
    api/           API REST + endpoints de NextAuth
  modules/         un módulo por dominio: clubs, cuotas, socios, actividades, cuenta-corriente, pagos-online
    <modulo>/      service.ts (lógica; recibe clubId) · schema.ts (Zod) · actions.ts (Server Actions) · components/
  lib/             transversal: auth, sesión, permisos, helpers de validación y de actions, errores
  components/      UI base reutilizable
tests/
  unit/            funciones puras, sin base
  integration/     servicios contra Postgres real (gestion_socios_test)
  helpers/         reset de base, factories y guard de base _test
docs/              propuesta, presentación, specs y planes (docs/superpowers)
```

**Multi-tenant:** cada tabla de negocio tiene `clubId`; los servicios de `src/modules/*/service.ts` siempre filtran por él y los guards (`requireClub`, `apiClub`) verifican que el usuario pertenezca al club de la URL.

## Cómo correrlo

### Opción A — GitHub Codespaces (sin instalar nada)

1. En GitHub: **Code → Codespaces → Create codespace on main**.
2. Esperar a que termine el setup (instala dependencias, crea la base y carga datos demo).
3. En la terminal: `npm run dev` y abrir el puerto 3000.

### Opción B — Docker local

```bash
docker compose up --build
```

### Opción C — Node local

Requiere Node 22 (`nvm use` toma la versión de `.nvmrc`).

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:deploy && npm run db:seed
npm run dev
```

### Migraciones

El esquema se versiona con `prisma migrate` (carpeta `prisma/migrations`).

- Para cambiar el modelo: editar `prisma/schema.prisma` y correr `npm run db:migrate -- --name <cambio>`; se genera una migración SQL nueva para commitear.
- `npm run db:deploy` aplica las migraciones pendientes (CI, contenedores, producción).
- Si tu base local fue creada con el antiguo `db push`, `db:deploy` falla con P3005: recreala con `npx prisma migrate reset` y `npm run db:seed` (con Docker: `docker compose down -v` y volver a levantar).

### Usuarios demo (con `DEMO_LOGIN=true`)

| Email | Rol |
|---|---|
| admin@gestiondesocios.com | Admin general |
| admin@demo.club | Admin del club "demo" |
| socio@demo.club | Socio del club "demo" |

El seed deja cargos de dos meses (uno vencido y otro por vencer): Juan figura moroso y Lucía (`socio@demo.club`) tiene deuda por vencer para probar el pago online. Por eso "Generar cargos" del mes en curso puede informar 0 cargos nuevos: ya existen.

## API REST

Autenticada con la sesión JWT de NextAuth.

| Método | Ruta | Rol |
|---|---|---|
| GET | `/api/me` | cualquiera logueado |
| GET / POST | `/api/clubs/:slug/socios` | admin del club |
| GET | `/api/clubs/:slug/actividades` | admin o socio del club |
| POST / DELETE | `/api/clubs/:slug/actividades/:id/inscripcion` | socio |

## Tests

```bash
npm test          # unitarios + integración (requiere Postgres: docker compose up -d db)
npm run test:unit # solo unitarios, sin base
npm run test:int  # solo integración, contra gestion_socios_test (ver .env.test)
npm run typecheck # tipos
```

Los tests de integración recrean la base gestion_socios_test en cada corrida y vacían las tablas antes de cada test; se niegan a correr contra una base cuyo nombre no termine en _test.

El CI de GitHub Actions corre typecheck, tests y build en cada push.

## Deploy (Vercel + Neon)

1. Crear una base Postgres en [Neon](https://neon.tech) y copiar dos connection strings: la **con pooler** (host con `-pooler`) para `DATABASE_URL` y la **directa** para `DIRECT_URL`.
2. Importar el repo en Vercel y cargar las variables de `.env.example` (`DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `SUPERADMIN_EMAIL`, Google opcional).
3. Aplicar migraciones y datos demo desde una máquina con acceso a la base, pasando la URL **directa en línea** (nunca en `.env`, que apunta siempre a localhost):

   ```bash
   DATABASE_URL="<neon-directa>" DIRECT_URL="<neon-directa>" npm run db:deploy
   DATABASE_URL="<neon-directa>" DIRECT_URL="<neon-directa>" npm run db:seed
   ```

Las migraciones no corren en el build de Vercel: los deploys de preview comparten la base con producción.

**Pasaje a migraciones (una sola vez, base creada con `db push`; solo tiene datos demo):**

```bash
DATABASE_URL="<neon-directa>" DIRECT_URL="<neon-directa>" npx prisma migrate reset --force --skip-seed
DATABASE_URL="<neon-directa>" DIRECT_URL="<neon-directa>" npm run db:seed
DATABASE_URL="<neon-directa>" DIRECT_URL="<neon-directa>" npx prisma migrate status   # "Database schema is up to date!"
```

Opcional: crear antes un branch en Neon como respaldo.

> `DEMO_LOGIN` permite entrar sin contraseña: usarlo solo para demos.
