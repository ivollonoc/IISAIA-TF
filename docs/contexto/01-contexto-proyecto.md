# Contexto del proyecto: Gestión de Socios (TP Final IISAIA)

> Resumen para retomar el trabajo en una sesión nueva. Estado al 2026-10-02.

## Qué es

Trabajo final de **Introducción a la Ingeniería de Software con IA** (Especialización en IA, FIUBA).
App web **multi-tenant** para que clubes deportivos gestionen socios, cuotas y actividades, y para que cada socio se autogestione.

- Repo: https://github.com/ivollonoc/IISAIA-TF (rama `main`)
- **Ubicación del código:** `C:\Users\ignacio.vollono\dev\IISAIA-TF`. Antes estaba en Google Drive (`H:\Mi unidad\CEIA\...\IISAIA-TF`); a partir de ahora se trabaja en la copia local.
- Documentos del repo: `README.md`, `docs/propuesta.md`, `docs/presentacion-v1.pptx` y `descripcion-app` (la idea original).

## Roles y funcionalidades (v1)

| Rol | Puede |
|---|---|
| Admin general (`SUPERADMIN`) | Crear clubes y asignarles un admin por email |
| Admin de club (`ADMIN_CLUB`) | Tipos de socio con cuota · alta, modificación y baja lógica de socios · registrar pagos manuales · actividades con día, hora y cupo · tablero del mes |
| Socio (`SOCIO`) | Ver su estado de cuota e historial de pagos · inscribirse y cancelar actividades respetando el cupo |

**Fuera de v1 (roadmap):** pago online (Mercado Pago), subdominio por club, calendario de eventos, notificaciones y reportes.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · NextAuth (JWT, Google + login demo) · **Prisma + PostgreSQL** · Zod · Vitest

No hay un backend separado: es **Next.js full-stack**. Las páginas, las Server Actions y la API REST (`src/app/api`) corren en el servidor de Next y llaman a la lógica de `src/server/`, que usa Prisma para hablar con Postgres.

```
Navegador → Next.js (server components / server actions / API)
              └ src/server/*.ts → db (Prisma Client) ──DATABASE_URL──► Postgres (Neon)
```

## Estructura

```
prisma/
  schema.prisma   estructura de la base (tablas, relaciones, enums)
  seed.ts         datos demo (OJO: borra todo y recarga)
src/
  app/            páginas y rutas: admin/, c/[slug]/ (admin y socio), api/, login/
  server/         lógica de negocio: socios, pagos, actividades, tipos, clubs (todas reciben clubId)
  lib/            db.ts (Prisma Client), auth, sesión, permisos, validación
  components/     UI reutilizable
tests/            Vitest: periodo, permisos, validación
docs/             propuesta, presentación y este contexto
```

**Multi-tenant:** cada tabla de negocio tiene `clubId`, los servicios de `src/server` siempre filtran por él y los guards (`requireClub`, `apiClub`) verifican que el usuario pertenezca al club de la URL (`/c/[slug]`).

## Modelo de datos (resumen)

```
Club(id, nombre, slug)
Usuario(id, email, rol, clubId?)
TipoSocio(id, clubId, nombre, cuotaMensual)
Socio(id, clubId, usuarioId?, nroSocio, nombre, apellido, dni, email?, tipoSocioId, activo)
Pago(id, clubId, socioId, periodo "YYYY-MM", monto, medio, fecha)   UNIQUE(socioId, periodo)
Actividad(id, clubId, nombre, diaSemana, hora, cupo, activa)
Inscripcion(id, clubId, actividadId, socioId)                      UNIQUE(actividadId, socioId)
```

Un socio está **al día** si tiene un pago del período actual. Se calcula, no se guarda.

## Base de datos: estado actual

- La base es un **Postgres en Neon** (en la nube, AWS us-east-2).
- El `.env` local apunta a Neon, así que **la app local ya lee y escribe en Neon**. No hay Postgres corriendo en la PC: Docker no está funcionando.
- Las tablas ya existen en Neon (la app local funciona contra ellas).
- **Nada corre el seed automáticamente contra Neon.** Solo se resetea si se ejecuta `npm run db:seed` a mano con el `.env` apuntando a Neon.

Detalle conceptual en `02-notas-base-de-datos.md`.

## Variables de entorno

Viven en `.env` (en `.gitignore`, **nunca se sube**). La plantilla está en `.env.example`.

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Connection string de Postgres (hoy, Neon) |
| `NEXTAUTH_SECRET` | Firma de los JWT de sesión |
| `AUTH_TRUST_HOST` | `true`: toma el host del request |
| `NEXTAUTH_URL` | URL fija en prod (por ejemplo, `https://<proyecto>.vercel.app`) |
| `SUPERADMIN_EMAIL` | Email que recibe el rol SUPERADMIN |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Login con Google (opcional) |
| `DEMO_LOGIN` | `true` habilita el login sin contraseña. Solo para demo. |

## Comandos

```bash
npm run dev        # levanta Next en localhost:3000 (no toca datos)
npm run db:push    # aplica la estructura de schema.prisma a la base de DATABASE_URL
npm run db:seed    # BORRA todo y carga datos demo en la base de DATABASE_URL
npm test           # tests unitarios
npm run typecheck  # chequeo de tipos
npm run build      # prisma generate + next build
```

Usuarios demo (con `DEMO_LOGIN=true`): `admin@gestiondesocios.com` (admin general), `admin@demo.club` (admin del club demo) y `socio@demo.club` (socio).

## Infra y automatizaciones

- **CI (GitHub Actions, `.github/workflows/ci.yml`):** en cada push o PR levanta un Postgres descartable y corre `db push`, `seed`, typecheck, tests y build. No toca Neon.
- **docker-compose.yml:** Postgres local + app; en cada arranque corre `db push` + `seed` contra la base local de Docker. Hoy no se usa.
- **Codespaces (`.devcontainer`):** al crearse corre `db push` + `seed` contra la base local del codespace.

## Próximos pasos

1. **Deploy en Vercel:**
   - Importar el repo en vercel.com.
   - Cargar las variables de entorno en el panel de Vercel.
   - Hacer el deploy.
   - Cargar `NEXTAUTH_URL` con la URL final y volver a hacer redeploy.
2. En Vercel, usar la **URL pooled de Neon** (host con `-pooler`, más `&pgbouncer=true`). Opcional: agregar `directUrl` en `schema.prisma` para que `db push` use la conexión directa.
3. Si se usa Google: agregar el redirect `https://<proyecto>.vercel.app/api/auth/callback/google` en Google Cloud.
4. (Opcional) Separar las bases de dev y prod: un Postgres local o un *branch* `dev` de Neon para desarrollar, y dejar el Neon principal solo para prod.
5. Decidir si `DEMO_LOGIN` queda activo en prod (solo para la presentación).
