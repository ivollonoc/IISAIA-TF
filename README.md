# Gestión de Socios — TP Final IISAIA

Trabajo final del curso **Introducción a la Ingeniería de Software con Inteligencia Artificial** (Especialización en IA, FIUBA).

App web multi-tenant para que clubes deportivos gestionen socios, cuotas y actividades, y para que cada socio se autogestione.

- Propuesta (problema, usuarios, MVP, stack): [docs/propuesta.md](docs/propuesta.md)
- Presentación v1: [docs/presentacion-v1.pptx](docs/presentacion-v1.pptx)
- Descripción original de la idea: [descripcion-app](descripcion-app)

## Funcionalidades v1

| Rol | Puede |
|---|---|
| Admin general | Crear clubes y asignar su administrador |
| Admin de club | Tipos de socio y cuotas · alta/modificación/baja de socios · registrar pagos · actividades con cupo · tablero del mes |
| Socio | Ver estado de cuota e historial de pagos · inscribirse/cancelar actividades (respeta cupo) |

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · NextAuth (JWT, Google + login demo) · Prisma · PostgreSQL · Zod · Vitest

## Estructura

```
prisma/            schema.prisma (modelo multi-tenant) y seed.ts (datos demo)
src/
  app/             páginas y rutas (App Router)
    admin/         panel del admin general
    c/[slug]/      espacio de cada club: /admin y /socio
    api/           API REST + endpoints de NextAuth
  server/          lógica de negocio (cada función recibe clubId)
  lib/             auth, sesión, permisos, validación, helpers
  components/      UI reutilizable
tests/             tests unitarios (Vitest)
docs/              propuesta y presentación
```

**Multi-tenant:** cada tabla de negocio tiene `clubId`; los servicios en `src/server` siempre filtran por él y los guards (`requireClub`, `apiClub`) verifican que el usuario pertenezca al club de la URL.

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

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run db:push && npm run db:seed
npm run dev
```

### Usuarios demo (con `DEMO_LOGIN=true`)

| Email | Rol |
|---|---|
| admin@gestiondesocios.com | Admin general |
| admin@demo.club | Admin del club "demo" |
| socio@demo.club | Socio del club "demo" |

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
npm test          # unitarios
npm run typecheck # tipos
```

El CI de GitHub Actions corre typecheck, tests y build en cada push.

## Deploy (Vercel + Neon)

1. Crear una base Postgres en [Neon](https://neon.tech) y copiar la connection string.
2. Importar el repo en Vercel y cargar las variables de `.env.example` (`DATABASE_URL`, `NEXTAUTH_SECRET`, `SUPERADMIN_EMAIL`, Google opcional).
3. Desde una máquina con acceso a la base: `npx prisma db push && npm run db:seed`.

> `DEMO_LOGIN` permite entrar sin contraseña: usarlo solo para demos.
