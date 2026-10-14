# Gestión de Socios — TP Final IISAIA

Trabajo final del curso **Introducción a la Ingeniería de Software con Inteligencia Artificial** (Especialización en IA, FIUBA).

App web multi-tenant para que clubes deportivos gestionen socios, cuotas y actividades, y para que cada socio se autogestione.

- Propuesta (problema, usuarios, MVP, stack): [docs/propuesta.md](docs/propuesta.md)
- Presentación v1: [docs/presentacion-v1.pptx](docs/presentacion-v1.pptx)
- Descripción original de la idea: [descripcion-app](descripcion-app)

## Funcionalidades

| Rol | Puede |
|---|---|
| Admin general | Pestaña **Clubes**: crear clubes y asignar su administrador, ver socios activos de cada uno (sin información financiera de los clubes) · pestaña **Avisos**: avisar a los admins de club |
| Admin de club | Tipos de socio, cuotas y día de vencimiento · alta/modificación/baja de socios e **importación desde CSV** (vista previa con errores por fila, todo o nada) · **Agenda** (vistas semana, mes y lista): actividades recurrentes con uno o más horarios por semana (incluso varios el mismo día), vigencia, cupo y precio por clase; ver quién reservó cada clase; eventos puntuales informativos o con inscripción (cupo y precio opcionales); suspender o reprogramar clases; **Grupos familiares** (indicadores y armado de grupos) · generar las cuotas del mes · registrar pagos en ventanilla y anular cargos · cuenta corriente del club · tablero del mes |
| Socio | Ver su cuenta corriente y su estado (al día / con deuda vencida) · pagar cargos online · **Actividades y eventos**: reservar clases sueltas o todas las de un horario por N semanas (cupo y lista de espera por clase; las pagas generan su cargo) e inscribirse a eventos · **Calendario** (semana o mes) · el titular de un grupo familiar paga los cargos de todo el grupo desde **Pagos del grupo** |

Los tres roles tienen una **bandeja de avisos** (campana en el encabezado y franja con el último aviso sin leer). Los avisos se generan solos: pago acreditado, cargos del mes listos para pagar, clases suspendidas o reprogramadas, actividades y eventos nuevos o cancelados, cambios de horario y lugares liberados para quienes están en lista de espera. El admin de club también envía avisos manuales (a todos o a los inscriptos de una actividad) y elige las vías: in-app siempre, más mail y/o SMS. El admin general avisa a los admins de club.

### Avisos por mail y SMS (simulados)

Los mails y SMS se registran en la base (`MensajeSaliente`) pero no se muestran a nadie: los admins solo ven el historial de sus avisos manuales, nunca los mensajes individuales. Con `RESEND_API_KEY` y `EMAIL_FROM` los mails salen de verdad por [Resend](https://resend.com); los SMS siempre son simulados.

### Pagos online (simulados)

El checkout usa la pasarela configurada en `PASARELA` (por defecto `simulada`). Tarjetas de prueba: `4000 0000 0000 0001` (aprobada) y `4000 0000 0000 0002` (rechazada por fondos insuficientes), con cualquier vencimiento futuro y CVV de 3 dígitos. Nunca se guardan el número completo ni el CVV. La integración con Mercado Pago está preparada (`src/modules/pagos-online/mercadopago.ts`) pero no implementada.

### Colores y escudo de cada club

Cada club tiene su escudo (`Club.logoUrl`, archivo en `public/clubs/`) y su paleta (`Club.tema`): el encabezado muestra el escudo y el nombre, y los botones, links y resaltados usan los colores del club (en su subdominio y para sus usuarios). Los colores con significado (verde "al día", ámbar "debe", rojo "error") son iguales en todos los clubes. Sin tema, se usa el verde por defecto.

**Decisión:** el tema se genera con la skill de Claude Code [`club-branding`](.claude/skills/club-branding/SKILL.md) a partir del logo, porque elegir el color institucional requiere criterio (descartar fondo y contornos, reconocer el color de la camiseta). La app solo valida (`src/lib/tema.ts`: formato y contraste AA) y aplica.

#### Cómo se tematiza un club (skill `club-branding`)

Hoy no hay una pantalla para que el club cargue su escudo: lo tematiza quien mantiene la app, pidiéndoselo a Claude Code (por ejemplo, "tematizá el club atlas con este escudo"). La skill:

1. **Extrae los colores** del logo (svg, png, jpg o webp) con `sharp`: colores dominantes con porcentaje, marcando blanco, negro, gris y fondo probable.
   ```bash
   npx tsx .claude/skills/club-branding/scripts/paleta.ts extraer public/clubs/demo.svg
   ```
2. **Elige primario y secundario mirando el logo** (lo hace Claude, no el script): descarta fondo y contornos y se queda con los colores institucionales, no necesariamente los de más píxeles.
3. **Genera el tema y una lámina de vista previa**: escala 50–950 en OKLCH con el tono del primario, texto blanco u oscuro según contraste, y validación con la misma regla de la app. Si el primario no llega a AA, falla; con `--ajustar` lo oscurece.
   ```bash
   npx tsx .claude/skills/club-branding/scripts/paleta.ts tema --primario "#b5121b" --secundario "#1d3f8f" \
     --logo public/clubs/demo.svg --salida tema.json --preview tema.html
   ```
4. **Pide aprobación** mostrando la lámina, y recién entonces **aplica**: copia el logo a `public/clubs/<slug>.<ext>` y guarda `logoUrl` y `tema` en el club.
   ```bash
   DATABASE_URL=<base local> npx tsx .claude/skills/club-branding/scripts/aplicar.ts <slug> tema.json <logo>
   ```
   Si `DATABASE_URL` no es local se niega; contra producción hay que confirmarlo y pasar `--produccion`.

Con el escudo demo, la skill extrae rojo `#b5121b` (55 %), blanco, azul `#1d3f8f` y un contorno oscuro; elige rojo como primario y azul como secundario, con texto blanco. Ese es el tema del club demo en `prisma/seed.ts`.

**En producción**, además de `aplicar.ts --produccion` contra Neon, el logo de `public/clubs/` se commitea y se despliega (Vercel solo sirve lo que está en el repo). El tema se ve en el subdominio del club (aunque no haya sesión), para los usuarios del club en toda la app y en `/c/<slug>` para el admin general.

**Pendiente:** que el admin del club suba el escudo desde la configuración (con almacenamiento de archivos, p. ej. Vercel Blob) y elija entre los colores propuestos.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · NextAuth (JWT, link mágico por mail + login demo) · Prisma · PostgreSQL · Zod · Vitest

## Estructura

```
prisma/            schema.prisma, migrations/ (historial versionado) y seed.ts (datos demo)
src/
  app/             páginas y rutas (App Router): composición, sin lógica de negocio
    admin/         panel del admin general
    c/[slug]/      espacio de cada club: /admin y /socio
    api/           API REST + endpoints de NextAuth
  modules/         un módulo por dominio: clubs, cuotas, socios, actividades, cuenta-corriente, pagos-online, calendario
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

### Ingreso

Sin contraseñas: en la página principal se ingresa el email y llega un **link mágico** (15 minutos, un solo uso). Al crear un club, su admin recibe una **invitación** por mail (7 días); lo mismo un socio dado de alta con email (el admin puede reenviarla desde su ficha). Con mails simulados y `DEMO_LOGIN=true`, el link se muestra en pantalla para poder seguir la demo.

### Usuarios demo (con `DEMO_LOGIN=true`)

| Email | Rol |
|---|---|
| admin@gestiondesocios.com | Admin general |
| admin@demo.club | Admin del club "demo" |
| socio@demo.club | Socio del club "demo" |

El seed deja cargos de dos meses (uno vencido y otro por vencer): Juan figura moroso y Lucía (`socio@demo.club`) tiene deuda por vencer para probar el pago online. Por eso "Generar cargos" del mes en curso puede informar 0 cargos nuevos: ya existen.

En la Agenda: Natación (lunes y miércoles, cupo 2, $1.250 por clase, Lucía con sus próximas 4 clases reservadas), Fútbol infantil (lunes, $1.500, con una clase suspendida y otra reprogramada) y Yoga (martes y jueves, gratis; Martín y Valentina llenan la próxima clase y Lucía está en su lista de espera); una asamblea informativa, una clínica de natación gratis con cupo y una cena anual paga ($15.000). Grupos familiares: Lucía es titular de Sofía y Martín de Valentina.

## API REST

Autenticada con la sesión JWT de NextAuth.

| Método | Ruta | Rol |
|---|---|---|
| GET | `/api/me` | cualquiera logueado |
| GET / POST | `/api/clubs/:slug/socios` | admin del club |
| GET | `/api/clubs/:slug/actividades` | admin o socio del club |

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
2. Importar el repo en Vercel y cargar las variables de `.env.example` (`DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `APP_URL`, `DEMO_LOGIN`; `RESEND_API_KEY` y `EMAIL_FROM` para mails reales).
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

> `DEMO_LOGIN` permite entrar sin contraseña a los usuarios demo: usarlo solo para demos.

### Subdominio por club (opcional)

Con `TENANT_MODE=subdomain` y `ROOT_DOMAIN=<dominio>` cada club tiene su dirección: `demo.<dominio>` es la página pública del club y sus áreas quedan en `demo.<dominio>/admin` y `demo.<dominio>/socio`. El middleware las reescribe a las rutas internas `/c/demo/…`, y `<dominio>/c/demo/…` redirige al subdominio. El dominio raíz sirve la landing y el panel del admin general. La sesión vale para el dominio y todos sus subdominios, y los links de ingreso por mail de un usuario de club abren en su subdominio. Sin estas variables (o en los previews de Vercel) todo sigue funcionando por `/c/<slug>`.

**En local:**

```bash
TENANT_MODE=subdomain ROOT_DOMAIN=localhost:3000 npm run dev
```

Abrir `http://demo.localhost:3000` (Chrome, Edge y Firefox resuelven `*.localhost` sin tocar DNS ni `/etc/hosts`). Los navegadores no comparten cookies entre subdominios de `localhost`: se entra desde el subdominio del club (admin y socio del club) y desde `http://localhost:3000` solo el admin general.

**Publicado (Vercel + NIC.ar), con `clubdesocios.com.ar`:**

1. **NIC.ar** → Mis dominios → `clubdesocios.com.ar` → Delegaciones: reemplazar los servidores DNS por `ns1.vercel-dns.com` y `ns2.vercel-dns.com`. NIC.ar no aloja registros: el DNS pasa a administrarse en Vercel. El comodín `*.` necesita los nameservers de Vercel para emitir su certificado. La delegación puede tardar unas horas.
2. **Vercel** → proyecto → Settings → Domains: agregar `clubdesocios.com.ar` (producción), `www.clubdesocios.com.ar` (redirige al anterior) y `*.clubdesocios.com.ar`. Con los nameservers de Vercel los registros (apex, `www` y comodín) se crean solos.
3. **Vercel** → Settings → Environment Variables, solo en **Production**: `TENANT_MODE=subdomain`, `ROOT_DOMAIN=clubdesocios.com.ar` y `APP_URL=https://clubdesocios.com.ar`. Sin `NEXTAUTH_URL`: NextAuth toma el host de cada pedido. En Preview no se cargan, así que los previews siguen por `/c/<slug>`.
4. Volver a desplegar: `TENANT_MODE` y `ROOT_DOMAIN` se leen al compilar.
   Desde ese momento, en Production se entra solo por `clubdesocios.com.ar` y sus subdominios: en el alias `*.vercel.app` de producción la cookie de sesión (del dominio `.clubdesocios.com.ar`) no se guarda. Los previews no cambian.
5. Opcional, para mails reales con Resend: verificar el dominio en Resend y cargar sus registros (SPF, DKIM) en Vercel → Domains → `clubdesocios.com.ar` → DNS Records.
