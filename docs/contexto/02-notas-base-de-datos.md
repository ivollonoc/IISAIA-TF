# Notas: cómo funciona la base de datos en el proyecto

> Resumen de la charla del 2026-10-02 sobre Postgres, Prisma, Neon y Vercel.

## 1. ¿Qué es Postgres?

**PostgreSQL** es un *motor de base de datos relacional*: un programa que guarda datos en **tablas** con filas y columnas y se consulta con **SQL**.
Corre como **servidor**: es un proceso que queda escuchando en un puerto (normalmente el 5432) y al que la app le manda consultas.

Lo que aporta frente a una planilla:
- **Tipos y reglas:** por ejemplo, que el DNI no se repita dentro de un club.
- **Relaciones:** un `Pago` tiene que apuntar a un `Socio` que exista. Si se borra el socio, sus pagos se borran en cascada.
- **Transacciones:** si se guardan varias cosas juntas y una falla, no queda ninguna a medias.

## 2. Tipos de bases de datos

| Tipo | Ejemplos | Cómo guarda | Cuándo conviene |
|---|---|---|---|
| Relacional (servidor) | **Postgres**, MySQL | Tablas relacionadas, SQL | Datos con estructura y relaciones (este proyecto) |
| Relacional (archivo) | SQLite | Un único archivo `.db`, sin servidor | Prototipos, apps chicas o de escritorio. No sirve bien en Vercel. |
| Documentos | MongoDB, Firestore | Objetos tipo JSON sin esquema fijo | Datos muy variables o poco relacionados |
| Clave-valor | Redis | `clave → valor`, en memoria | Cachés y sesiones. Complementa a la base principal. |

## 3. "Levantar" un Postgres

"Levantar" es **arrancar un programa que queda corriendo y escuchando en un puerto**.
El `docker-compose.yml` es una receta para levantar un Postgres en la PC con Docker; los datos persisten en un volumen.
**Hoy no se usa** porque Docker no está funcionando en la PC, así que no hay ningún Postgres local corriendo.

## 4. Local vs. Neon

**Neon es Postgres, el mismo motor, pero corriendo en servidores de ellos en internet.** Lo único que cambia es dónde vive.

```
Local:  app (localhost) ──► Postgres en la PC (Docker)
Prod:   app (Vercel)    ──► Postgres en Neon (nube)
```

La app en Vercel no puede conectarse a la PC, así que para prod hace falta una base accesible desde internet.
El flujo típico es **base local para desarrollar y Neon para prod**.

### Situación actual

```
Tu PC                                      Nube
┌───────────────────────┐                 ┌─────────────────────────┐
│ Navegador             │                 │ Neon (AWS us-east-2)    │
│  ↓ localhost:3000     │                 │  Postgres 24/7          │
│ Next.js (npm run dev) │ ──── SQL ─────► │  tablas Socio, Pago...  │
│  └ Prisma Client      │ ◄── filas ───── │  ← los datos viven acá  │
└───────────────────────┘                 └─────────────────────────┘
```

- La **app** corre en local; los **datos** viven en Neon.
- Todavía no hay "prod", porque prod sería la app desplegada en Vercel.
- Cuando se despliegue en Vercel con la misma `DATABASE_URL`, local y prod van a **compartir los mismos datos**.

## 5. Prisma, schema y seed

**Prisma** es un *ORM*: una capa entre el código TypeScript y la base. En lugar de escribir SQL a mano:
```ts
db.socio.findMany({ where: { clubId } })   // Prisma lo traduce a SQL
```
y además da autocompletado y chequeo de tipos.

| Archivo | Define | Comando |
|---|---|---|
| `prisma/schema.prisma` | La **estructura**: tablas, columnas, tipos y relaciones (el "plano") | `npm run db:push` compara el plano contra la base y crea o ajusta las tablas |
| `prisma/seed.ts` | **Datos** de ejemplo: club demo, 5 socios, pagos, actividades | `npm run db:seed`, que **empieza borrando todo** (`deleteMany`) |

## 6. Qué viaja a Neon en cada acción

| Acción | Qué viaja | ¿Pisa datos? |
|---|---|---|
| `npm run db:push` | La **estructura** del schema | Normalmente no. Si un cambio implica perder datos, Prisma avisa. |
| `npm run db:seed` | **Filas** demo | **Sí**: borra todo y recarga |
| Usar la app | Lecturas y escrituras de filas | Solo lo que se haga en la app |

Neon **no lee los archivos** del proyecto. Los archivos de Prisma quedan en la PC; Neon solo recibe comandos SQL.

### ¿Se sobreescribe la base cada vez que se lanza la app?

**No.**

| Comando | ¿Toca datos de Neon? |
|---|---|
| `npm run dev` (`next dev`) | No |
| `npm run build` (`prisma generate && next build`) | No. `generate` arma el código en la PC y no se conecta a la base. |
| `npm install` (postinstall: `prisma generate`) | No |
| `npm run db:seed` | **Sí, pero solo si se corre a mano** |

Los lugares que corren el seed solos (docker-compose, CI de GitHub y Codespaces) usan **bases locales o descartables**, nunca Neon.
⚠️ Cuando haya datos reales en Neon, **no correr `db:seed` con el `.env` apuntando a Neon**.

## 7. Dónde se ve la conexión en el código

Es una cadena de 4 eslabones:

1. **`.env`, línea 2:** `DATABASE_URL="postgresql://usuario:contraseña@ep-...neon.tech/neondb?sslmode=require"`.
   Contiene el protocolo, el usuario y la contraseña, el **servidor de Neon** y el nombre de la base. Next.js lo carga automáticamente.
2. **`prisma/schema.prisma`:** `datasource db { url = env("DATABASE_URL") }`, que le dice a Prisma a qué base conectarse.
3. **`src/lib/db.ts`:** `export const db = ... new PrismaClient()` crea la conexión usando esa URL.
4. **`src/server/socios.ts`:** `db.socio.findMany({ where: { clubId } })` es la consulta real, que viaja como SQL a Neon.

**Clave:** el código no sabe si la base es local o Neon. Lo decide **una sola línea** del `.env`.

## 8. Variables de entorno y Vercel

El `.env` no se sube a git porque tiene contraseñas. **Vercel recibe los secretos por su propio panel**:

```
GitHub (código, sin secretos) ──┐
                                ├──► Vercel arma la app ──► se conecta a Neon
Panel de Vercel (secretos) ─────┘
```

En Vercel, `process.env.DATABASE_URL` vale lo que se cargue en el panel. Para el código es igual que el `.env`.

**Pasos:**
1. vercel.com → **Add New → Project** → importar `ivollonoc/IISAIA-TF`.
2. En **Environment Variables**, copiar las del `.env`: `DATABASE_URL`, `NEXTAUTH_SECRET`, `SUPERADMIN_EMAIL`, `DEMO_LOGIN` y `AUTH_TRUST_HOST`.
3. **Deploy.** Después, agregar `NEXTAUTH_URL` con la URL final y hacer redeploy.
4. Para editarlas más adelante: Settings → Environment Variables, y luego **Redeploy** para que se apliquen.

Vercel **no crea tablas** en el build: el schema se aplica con `npm run db:push` desde la PC. En Neon ya están creadas.

**URL pooled:** en Vercel cada request puede abrir una conexión nueva. Conviene usar la URL con `-pooler` de Neon (más `&pgbouncer=true`) para no agotar las conexiones.
La alternativa es la integración Neon del Marketplace de Vercel, que carga `DATABASE_URL` sola, pero suele crear una base nueva y habría que volver a hacer push y seed.
