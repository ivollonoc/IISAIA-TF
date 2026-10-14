# Gestión de Socios — TP Final IISAIA

Trabajo final del curso **Introducción a la Ingeniería de Software con Inteligencia Artificial** (Especialización en IA, FIUBA).

App web multi-tenant para que clubes deportivos gestionen socios, cuotas y actividades, y para que cada socio se autogestione.

Publicada en [clubdesocios.com.ar](https://clubdesocios.com.ar) (Vercel + Neon).

**Integrantes:** Pablo Salvagni · Ignacio Vollono

- Propuesta (problema, usuarios, MVP, stack): [docs/propuesta.md](docs/propuesta.md)
- Presentación del TP final: [docs/presentacion-tp-final.pptx](docs/presentacion-tp-final.pptx) (anteriores: [v1](docs/presentacion-v1.pptx) y [v2](docs/presentacion-v2.pptx))
- Descripción original de la idea: [descripcion-app](descripcion-app)

**Informe:** [Cómo correrlo](#cómo-correrlo) · [Arquitectura](#arquitectura) · [Decisiones propias](#decisiones-propias) · [Proceso y gestión del contexto](#proceso-y-gestión-del-contexto) · [Configuración del agente](#configuración-del-agente) · [Qué salió mal y dónde se desvió el agente](#qué-salió-mal-y-dónde-se-desvió-el-agente)

## Funcionalidades

| Rol | Puede |
|---|---|
| Admin general | Pestaña **Clubes**: crear clubes y asignar su administrador, ver socios activos de cada uno (sin información financiera de los clubes) · pestaña **Avisos**: avisar a los admins de club · pestaña **Reportes**: socios activos, actividades y reservas por club (sin dinero) |
| Admin de club | Tipos de socio, cuotas y día de vencimiento · alta/modificación/baja de socios e **importación desde CSV** (vista previa con errores por fila, todo o nada) · **Agenda** (vistas semana, mes y lista): actividades recurrentes con uno o más horarios por semana (incluso varios el mismo día), vigencia, cupo y precio por clase; ver quién reservó cada clase; eventos puntuales informativos o con inscripción (cupo y precio opcionales); suspender o reprogramar clases; **Grupos familiares** (indicadores y armado de grupos) · generar las cuotas del mes · registrar pagos en ventanilla y anular cargos · cuenta corriente del club · tablero del mes · **Reportes** (últimos 6 o 12 meses): recaudación emitida vs cobrada, morosidad, ocupación por actividad, puntaje promedio de cada actividad y altas/bajas |
| Socio | Ver su cuenta corriente y su estado (al día / con deuda vencida) · pagar cargos online · **Actividades y eventos**: reservar clases sueltas o todas las de un horario por N semanas (cupo y lista de espera por clase; las pagas generan su cargo) e inscribirse a eventos · **puntuar** las actividades a las que ya fue (de 0,5 a 5 estrellas, con comentario) · **Calendario** (semana o mes) · el titular de un grupo familiar paga los cargos de todo el grupo desde **Pagos del grupo** |

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

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · NextAuth (JWT, link mágico por mail + login demo) · Prisma · PostgreSQL · Zod · Recharts · Vitest

No hay un backend separado: es Next.js full-stack. Las páginas (server components), las Server Actions y la API REST corren en el servidor de Next y llaman a la lógica de `src/modules/`, que usa Prisma para hablar con Postgres (Neon en producción, Docker en local).

## Arquitectura

```
Navegador
   │  demo.clubdesocios.com.ar/socio/pagos
   ▼
src/middleware.ts ─── TENANT_MODE=subdomain: reescribe <slug>.<dominio>/<ruta> → /c/<slug>/<ruta>
   │                  (lib/tenant.ts: decidirRuta, hostDelPedido; con TENANT_MODE=path no hace nada)
   ▼
src/app/…  page.tsx · Server Action · api/…/route.ts        ← solo composición
   │  requireClub(slug, área) (lib/session.ts) · apiClub(slug, áreas) (lib/api.ts)
   │  → sesión JWT (rol + club como claims) + permisos.ts: ¿el usuario pertenece a este club?
   ▼
src/modules/<dominio>/service.ts   ← lógica de negocio; recibe clubId y filtra siempre por él
   │        reglas.ts (puras, testeables sin base) · schema.ts (Zod en la entrada)
   ├──► Prisma (lib/db.ts) ──► PostgreSQL
   ├──► Pasarela  (pagos-online/pasarela.ts): simulada | mercadopago (esqueleto)
   └──► notificar() (notificaciones/emitir.ts), después de confirmar la transacción
            └► canales: in-app (bandeja) · mail (Resend o simulado) · SMS (simulado)
```

1. **Tenant.** Cada club es un `slug`. Por defecto se entra por `/c/<slug>/…`; con `TENANT_MODE=subdomain` el middleware traduce el subdominio a esa misma ruta interna, así que las páginas no saben en qué modo corren. Los links se arman con `urlClub` / `urlVisible` para que funcionen en los dos.
2. **Guards.** Cada page y cada Server Action vuelve a verificar el acceso con `requireClub` (la API usa `apiClub`): el formulario o el link no son una barrera de seguridad. En las acciones del socio, el `socioId` sale de la sesión, nunca del formulario.
3. **Servicios por dominio.** Toda tabla de negocio tiene `clubId` y todo servicio lo recibe y filtra por él. Los errores de negocio se lanzan como `DomainError` y `ejecutar()` (`lib/action.ts`) los convierte en un aviso legible, revalida y redirige.
4. **Integraciones detrás de interfaces.** El checkout del socio no conoce al proveedor: usa la interfaz `Pasarela` (`getPasarela()` según `PASARELA`; hoy `simulada`, con el esqueleto de Mercado Pago). Los avisos salen por `notificar()`, que arma los destinatarios del evento de dominio y entrega por los canales activos del club; un error al notificar se registra y nunca rompe la operación.
5. **Tema por club.** El layout lee `Club.tema` (validado por `lib/tema.ts`) y lo vuelca en variables CSS `--club-*`; las clases `bg-primario`, `text-primario-700`, etc. las usan.

## Estructura

```
prisma/            schema.prisma, migrations/ (historial versionado), seed.ts y escenario-demo.ts (datos demo)
src/
  middleware.ts    subdominio → /c/<slug>/… (solo con TENANT_MODE=subdomain)
  app/             páginas y rutas (App Router): composición, sin lógica de negocio
    admin/         panel del admin general: clubes, avisos, reportes
    c/[slug]/      espacio de cada club: página pública, /admin y /socio
    api/           API REST + endpoints de NextAuth
  modules/         un módulo por dominio (11): acceso, clubs, cuotas, socios, cuenta-corriente, pagos-online,
                   actividades, reservas, calendario, notificaciones, reportes
    <modulo>/      service.ts (lógica; recibe clubId) · schema.ts (Zod) · actions.ts (Server Actions) · reglas.ts (puras) · components/
  lib/             transversal: auth, sesión y guards, permisos, tenant, tema, validación, actions, errores, fechas
  components/      UI base reutilizable y gráficos
tests/
  unit/            funciones puras, sin base
  integration/     servicios contra Postgres real (gestion_socios_test)
  e2e/             Playwright: recorridos en el navegador contra la app levantada
  helpers/         reset de base, factories y guard de base _test
docs/              propuesta, presentaciones, contexto (docs/contexto) y specs y planes (docs/superpowers)
.claude/           configuración del agente versionada: settings.json y la skill club-branding
.mcp.json         servidores MCP del proyecto: Playwright MCP
```

El detalle de cada módulo está en [CLAUDE.md](CLAUDE.md#módulos-srcmodules).

## Decisiones propias

| Decisión | En lugar de | Por qué |
|---|---|---|
| **Ingreso con link mágico** por mail (15 min, un uso, token guardado hasheado) e **invitación** al dar de alta un club o un socio | Login con Google (lo que proponía la v1) | El alta la hace el club con el email del socio, así que alcanza con ese email: el socio no necesita cuenta de Google y no hay que registrar un callback de OAuth por cada dominio y subdominio. Los usuarios demo entran sin link (`DEMO_LOGIN`). |
| **Reserva por clase**: cupo y lista de espera por clase; se reservan clases sueltas o todas las de un horario por N semanas; cada clase paga genera su cargo | Inscripción mensual a la actividad con arancel mensual | El cupo real es de cada clase, no del mes: con la inscripción mensual no se sabía quién iba a cada clase ni se podía ofrecer un lugar que quedaba libre un día puntual. La migración `20261013140000_reservas` convirtió las inscripciones en reservas de las 4 semanas siguientes. |
| **Clases calculadas**: salen de los horarios semanales de la actividad; solo se guardan las excepciones (`ExcepcionClase`: suspendida o reprogramada) | Una tabla con cada clase | No hay que generar ni mantener filas de clases a futuro: cambiar un horario cambia las clases de inmediato (las reservas futuras que quedan sin clase se borran y se anulan sus cargos). Una reserva identifica la clase por (actividad, fecha, hora original). |
| **Subdominio por club detrás de `TENANT_MODE`** (`path` por defecto, `subdomain` en producción) | Subdominio siempre | Local, CI y los previews de Vercel siguen funcionando por `/c/<slug>` sin DNS ni certificados comodín. |
| **Pagos, mail y SMS detrás de interfaces**, con implementación simulada por defecto | Integrar Mercado Pago y un proveedor de SMS de entrada | Para la demo alcanza lo simulado; enchufar un proveedor real es implementar la interfaz (Mercado Pago ya tiene esqueleto y el mail sale por Resend si hay credenciales). |
| **Cuenta corriente**: cargos por período y pagos como única vía para cancelarlos | Un pago por período (v1) | Un mismo modelo cubre cuotas, clases y eventos pagos, y el pago del titular por todo su grupo familiar (un pago por socio, con el titular como pagador); "al día" se calcula, no se guarda. |
| **Tema por club generado con una skill** de Claude Code (`club-branding`) | Pantalla de configuración de colores | Elegir el color institucional desde un escudo requiere criterio (descartar fondo y contornos, reconocer el color de la camiseta); la app solo valida contraste AA y aplica. |
| **Admin general sin información financiera** de los clubes | Consolidado de recaudación de la plataforma | Privacidad de cada club: el admin general ve clubes, socios activos y actividad, no su dinero. |

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
npm run test:e2e  # end-to-end con Playwright (ver abajo)
npm run typecheck # tipos
```

Los tests end-to-end (`tests/e2e`, [playwright.config.ts](playwright.config.ts)) levantan la app sola (o reutilizan el `npm run dev` que esté corriendo) y la recorren en Chromium: ingreso con cada usuario demo y redirección sin sesión. Necesitan la base con el seed y `DEMO_LOGIN=true`. La primera vez hay que bajar el navegador: `npx playwright install chromium`. Si un test falla, `npx playwright show-report` muestra el reporte con la traza.

Los tests de integración recrean la base gestion_socios_test en cada corrida y vacían las tablas antes de cada test; se niegan a correr contra una base cuyo nombre no termine en _test.

El CI de GitHub Actions ([ci.yml](.github/workflows/ci.yml)) corre en cada push a `main` y en cada pull request, contra un Postgres descartable: `prisma migrate deploy` → seed → typecheck → tests → build → e2e (contra el build de producción; si fallan, sube el reporte de Playwright como artefacto).

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

## Proceso y gestión del contexto

### Cómo se trabajó: spec → plan → implementación → revisión

La v1 (30/09) se hizo en un solo commit a partir de la [propuesta](docs/propuesta.md). Desde la v2 cada etapa siguió el mismo flujo, con el plugin [superpowers](https://github.com/obra/superpowers) (hoy declarado en `.claude/settings.json`):

1. **Spec** (`docs/superpowers/specs/`): qué se construye y con qué decisiones, aprobada antes de escribir código. Los roadmaps [v2](docs/superpowers/specs/2026-10-12-roadmap-v2-design.md) y [v3](docs/superpowers/specs/2026-10-12-roadmap-v3-design.md) parten el trabajo en etapas 0 a 8 y fijan las decisiones transversales; las etapas 0, 1 y 2 tienen spec propia, y el [spec de ajustes](docs/superpowers/specs/2026-10-13-ajustes-familia-reservas-design.md) corrigió el rumbo a mitad del v3.
2. **Plan** (`docs/superpowers/plans/`): tareas chicas con archivos, tests y comandos, las restricciones globales (toda consulta filtra por `clubId`, los servicios reciben `hoy`) y un **Review Focus** con lo que la revisión tiene que mirar (por ejemplo, dos socios reservando el último lugar a la vez, o la migración de datos existentes).
3. **Implementación** en la rama de la etapa (`mvp1` a `mvp5`; después, una rama por cambio), con tests unitarios de reglas puras, tests de integración contra Postgres real y una migración Prisma nueva por cada cambio de modelo.
4. **Revisión** contra el spec y el Review Focus antes de cerrar la etapa. Los hallazgos quedan en commits propios: "Aplica los ajustes menores de la revisión de la etapa 1", "… de la etapa 2", "Revisión de la etapa 8: …".

Desde la configuración del agente (PR #2 en adelante), los cambios entran por rama y pull request.

### Qué se guardó para que el agente no pierda el hilo

| Dónde | Qué guarda | Para qué |
|---|---|---|
| [CLAUDE.md](CLAUDE.md) | Mapa de carpetas, módulos, comandos y convenciones (multi-tenant, `requireClub`, `ejecutar`, `DomainError`, migraciones, colores de marca) | Lo que el agente necesita en cualquier sesión, sin releer el código |
| [docs/contexto/](docs/contexto) | El [contexto del proyecto](docs/contexto/01-contexto-proyecto.md) para retomar en una sesión nueva, las [notas de base de datos](docs/contexto/02-notas-base-de-datos.md) (Postgres, Prisma, Neon, qué toca cada comando) y la [evaluación contra la consigna](docs/contexto/03-evaluacion-vs-consigna.md) | Resúmenes escritos al cerrar una conversación larga, para que la siguiente empiece desde ahí y no desde el historial |
| `docs/superpowers/specs` y `plans` | Una spec y un plan por etapa | Cada sesión arranca de un documento acotado a su etapa; el plan dice qué archivos tocar y cómo verificar |
| [.claude/settings.json](.claude/settings.json) | Permisos del proyecto | El agente corre tests y migraciones de desarrollo sin pedir permiso, pero no puede leer `.env` ni resetear la base |
| Memoria del agente (personal, no versionada) | Restricciones del entorno de cada integrante (por ejemplo, Windows sin permisos de admin ni Docker) | Que no proponga lo que no se puede correr en esa máquina |

Lo que se separó: una sesión por etapa (o por bloque de una etapa), sin arrastrar el historial de la anterior; la spec y el plan son el traspaso. Los secretos quedan fuera del contexto (`.env` bloqueado en los permisos).

## Configuración del agente

Todo lo versionado es para Claude Code:

| Pieza | Qué hay | Por qué así |
|---|---|---|
| Instrucciones del proyecto | [CLAUDE.md](CLAUDE.md): mapa de carpetas, tabla de módulos, comandos y convenciones | Son las reglas que hay que tener presentes en cada cambio: filtrar por `clubId`, re-verificar el acceso en cada action, sacar el `socioId` de la sesión, migrar en vez de `db push`, escribir en español |
| Permisos del runtime | [.claude/settings.json](.claude/settings.json). **allow:** typecheck, tests (incluidos los e2e), build, `prisma migrate dev`, seed, git local y las herramientas del Playwright MCP. **ask:** `git push`, crear o mergear PRs, `npm install`, `playwright install`, `migrate deploy`, editar migraciones ya escritas y el CI. **deny:** leer o editar `.env*`, `prisma migrate reset`, `db push`, `push --force` y `reset --hard` | Lo que se repite en cada etapa no pide permiso; lo que sale de la máquina, cambia dependencias o toca producción se confirma; lo destructivo o lo que expone secretos no se puede. `main` despliega en Vercel: por eso el push siempre se pregunta |
| Plugin | `superpowers` en `enabledPlugins` | Da el flujo spec → plan → ejecución → revisión con el que se generó `docs/superpowers` |
| Skill propia | [.claude/skills/club-branding](.claude/skills/club-branding/SKILL.md): del escudo del club a su tema. Extrae colores con `sharp`, Claude elige primario y secundario, genera la escala con contraste AA, pide aprobación y aplica | Es una tarea que necesita criterio visual y se repite por cada club; los scripts hacen lo mecánico y validan con la misma regla que la app (`lib/tema.ts`). `aplicar.ts` se niega si la base no es local |
| Servidor MCP | [.mcp.json](.mcp.json): Playwright MCP, habilitado para todos con `enabledMcpjsonServers` y sus herramientas permitidas en `settings.json` | Permite que el agente abra la app, navegue y saque capturas para verificar un cambio de UI en vez de suponer que funciona. Al estar versionado, lo tiene cualquiera que clone el repo |
| Lo personal | `.claude/settings.local.json` y `.claude/launch.json` | No se versionan: son de cada máquina |

**Pendiente:** instrucciones por tema con scope por path (`.claude/rules/` para `prisma/**`, `tests/**` y `src/modules/**`) y un sub-agent. No se agregó un sub-agent propio porque las revisiones de cada etapa ya se hacen con el flujo de superpowers sobre el Review Focus del plan. Si se suma, el candidato es un revisor de aislamiento multi-tenant y permisos, que es donde apareció el único desvío de seguridad (ver abajo).

## Qué salió mal y dónde se desvió el agente

| Qué pasó | Cómo se detectó | Cómo se corrigió |
|---|---|---|
| **`x-forwarded-host` sin acotar.** El middleware de subdominios resolvía el club con el valor de `x-forwarded-host`, sin chequear que fuera del dominio de la app. | Revisión de la etapa 8. | `hostDelPedido` (`lib/tenant.ts`) solo acepta ese valor si es del dominio de la app; si no, usa `host`. Con tests unitarios (`edaa2b7`). Los datos seguían protegidos por `requireClub`, pero la resolución del club no puede depender de un header arbitrario. |
| **Inscripción mensual → reserva por clase.** El roadmap v3 definía actividades con inscripción mensual (decisión 1) y así se implementó la agenda en la etapa 3. No representaba el uso real: el cupo es de cada clase. | Revisión funcional del 13/10, con la agenda ya hecha. | Spec de ajustes (bloque C) y [plan propio](docs/superpowers/plans/2026-10-13-reserva-por-clase.md); la migración convierte las inscripciones en reservas de las próximas 4 semanas (`dda87eb`). |
| **El seed dependía de la fecha.** Según el día en que se corría, la agenda demo tenía semanas vacías y la suspensión caía sobre la clase de Natación que se quería reprogramar en vivo. Los pagos y cargos quedaban con fecha "ahora". | Preparando la demo. | Las actividades del seed existen desde el inicio del mes anterior y `prisma/escenario-demo.ts` calcula las fechas relativas a la del seed, con tests (`d368c68`); el spec de ajustes fijó fechas realistas en el pasado para pagos y cargos. |
| **Login con Google descartado.** La propuesta y la v1 usaban NextAuth con Google. Con invitaciones por mail desde el club y un subdominio por club, cada dominio necesitaba su callback de OAuth y cada socio una cuenta de Google. | Al planificar acceso y subdominios (roadmap v3, decisión 7). | Etapa 5: link mágico e invitaciones, sin el provider de Google (`dc268d1`). |
| **Esquema con `db push` y desarrollo contra Neon.** En la v1 el esquema se aplicaba con `db push`, sin historial, y el `.env` local apuntaba a la base de Neon (no había Docker en la PC). | Al planificar la etapa 1, que tenía que migrar datos de `Pago` ([spec de la etapa 0](docs/superpowers/specs/2026-10-12-etapa-0-base-design.md)). | Etapa 0: `prisma migrate` con historial versionado y `directUrl`, tests de integración solo contra una base `*_test`, y permisos que niegan `db push` y `migrate reset`. |
| **El código se adelantó al spec.** Los varios horarios el mismo día y las dos pestañas del socio se implementaron (`95d3a1d`) antes de estar en el spec v3. La primera versión del subdominio (`54ceb6d`) dejaba URLs `<slug>.<dominio>/c/<slug>/…`. | Revisando el spec contra lo implementado. | Se actualizó el spec después (`7017c79`), y la etapa 8 se re-especificó con URLs limpias y plan propio (`dce7c3a`). |
| **Etapas sin plan propio.** La importación CSV (etapa 6), reportes y puntajes (etapa 7), los bloques A y B del spec de ajustes (privacidad y grupos familiares) y la primera versión del subdominio se implementaron directo desde el spec. | Evaluación del repo contra la consigna ([docs/contexto/03](docs/contexto/03-evaluacion-vs-consigna.md)). | Se dejó así y se documenta acá: eran cambios acotados, con el modelo y las pantallas ya definidos en el spec. Sin plan aparecieron desvíos menores, como los gráficos: el spec pedía componentes Tremor Raw copiados en `src/components/tremor/` y quedó un único `src/components/graficos.tsx` sobre Recharts. |
| **Sin pull requests en `mvp1`–`mvp5`.** Las ramas de etapa se integraron a `main` sin PR (no hay merge commits). | Evaluación contra la consigna. | Desde la configuración del agente todo entra por rama y PR (#2, #3, #4). |
