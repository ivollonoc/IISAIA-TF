# Gestión de Socios — TP Final IISAIA

App web multi-tenant para clubes: el admin general crea clubes, cada club gestiona socios, cuotas,
cobros y agenda, y cada socio se autogestiona. Publicada en clubdesocios.com.ar (Vercel + Neon).

Stack: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · NextAuth (JWT, link mágico
por mail + login demo) · Prisma · PostgreSQL · Zod · Recharts · Vitest. Ver `README.md` para correrlo
y desplegarlo.

## Comandos

```bash
npm run dev         # servidor local
npm run typecheck   # tsc --noEmit
npm test            # unit + integración (requiere Postgres: docker compose up -d db)
npm run test:unit   # solo unitarios, sin base
npm run test:int    # solo integración, contra gestion_socios_test (.env.test)
npm run build       # prisma generate + next build
npm run db:migrate  # nueva migración en desarrollo (prisma migrate dev)
npm run db:deploy   # aplica migraciones (prisma migrate deploy)
npm run db:seed     # datos demo (prisma/seed.ts)
```

El CI (`.github/workflows/ci.yml`) corre: migrate deploy → seed → typecheck → tests → build.

## Mapa de carpetas

```
.
├── CLAUDE.md, README.md        instrucciones para agentes / cómo correr, testear y desplegar
├── descripcion-app             consigna y descripción original de la app (texto)
├── package.json                scripts y dependencias
├── next.config.ts, tsconfig.json, postcss.config.mjs, vitest.config.ts
├── Dockerfile, docker-compose.yml, .devcontainer/   Postgres local, Docker y Codespaces
├── .env.example, .env.test     variables de entorno (.env no se versiona)
├── .github/workflows/ci.yml    CI en GitHub Actions
│
├── public/clubs/               escudos de los clubes (Club.logoUrl)
├── prisma/
│   ├── schema.prisma           modelo de datos (toda tabla de negocio lleva clubId)
│   ├── migrations/             historial versionado (0_init + una carpeta por etapa)
│   ├── seed.ts                 datos demo
│   └── escenario-demo.ts       períodos vencido / por vencer para la demo, según la fecha del seed
│
├── src/
│   ├── middleware.ts           TENANT_MODE=subdomain: reescribe <slug>.dominio/... a /c/<slug>/...
│   ├── app/                    rutas del App Router: solo composición, sin lógica de negocio
│   │   ├── page.tsx            home (ingreso por email)
│   │   ├── login/, ingresar/[token]/, sin-acceso/   login, canje del link mágico, acceso denegado
│   │   ├── avisos/             bandeja de avisos del usuario
│   │   ├── admin/              admin general: clubes, avisos, reportes globales
│   │   ├── c/[slug]/           espacio de cada club (página pública del club)
│   │   │   ├── admin/          admin de club: socios (+ importar, [id]), tipos, cuenta, agenda,
│   │   │   │                   actividades, calendario, grupos, avisos, reportes
│   │   │   └── socio/          socio: agenda, actividades, calendario, pagos, pagar
│   │   └── api/                API REST: auth/[...nextauth], me, clubs/[slug]/{socios,actividades}
│   ├── modules/<dominio>/      un módulo por dominio (ver abajo)
│   ├── lib/                    transversal
│   │   ├── auth.ts             config de NextAuth (claims rol y club)
│   │   ├── session.ts          guards de páginas y actions (requireClub…): base del aislamiento
│   │   ├── api.ts              guards y respuestas JSON de la API (apiClub…)
│   │   ├── permisos.ts         reglas de acceso puras
│   │   ├── tenant.ts           subdominios: urlClub / urlVisible / decidirRuta
│   │   ├── tema.ts             tema por club (Zod + contraste AA) → variables CSS --club-*
│   │   ├── action.ts           ejecutar(): envoltorio de Server Actions (revalida y redirige con aviso)
│   │   ├── aviso.ts            ?ok= / ?error= firmados en la URL
│   │   ├── errors.ts           error de negocio → mensaje legible
│   │   ├── validation.ts       helpers de Zod compartidos
│   │   ├── periodo.ts, format.ts   períodos "YYYY-MM", fechas en hora de Argentina
│   │   └── db.ts               singleton de PrismaClient
│   ├── components/             UI base: ui.tsx, Header, Tabs, BannerAvisos, LogoutButton, graficos.tsx
│   └── types/next-auth.d.ts    tipos de la sesión
│
├── tests/
│   ├── unit/                   funciones puras, sin base
│   ├── integration/            servicios contra Postgres real (gestion_socios_test)
│   └── helpers/                reset de base, factories, guard que exige una base *_test
│
└── docs/
    ├── propuesta.md            propuesta del TP
    ├── presentacion-v1/-v2/-tp-final.pptx   decks (los genera build_presentacion*.py con python-pptx)
    └── superpowers/
        ├── specs/              diseños por etapa y roadmaps v2/v3
        └── plans/              planes de implementación por etapa
```

### Módulos (`src/modules/`)

Convención: `service.ts` (lógica, siempre recibe y filtra por `clubId`) · `schema.ts` (Zod) ·
`actions.ts` (Server Actions, `"use server"`) · `reglas.ts` (reglas puras, testeables sin base) ·
`components/` (UI del dominio).

| Módulo | Qué hace |
|---|---|
| `acceso` | Login sin contraseña: link mágico (token hasheado, un uso), invitaciones, usuarios demo |
| `clubs` | Alta de clubes y su admin (solo superadmin); configuración del club; escudo y tema (`visual.ts`) |
| `cuotas` | Tipos de socio y su cuota mensual |
| `socios` | ABM de socios, grupos familiares, importación CSV (parser propio, todo o nada) |
| `cuenta-corriente` | Cargos por período, pagos (única vía para cancelar cargos), consultas y saldo |
| `pagos-online` | Checkout del socio con interfaz `Pasarela`: `simulada` (default) y esqueleto de `mercadopago` |
| `actividades` | Actividades recurrentes (horarios, cupo, precio por clase), lista de espera, puntajes |
| `reservas` | Reserva de clases concretas con cupo por clase |
| `calendario` | Agenda del admin y del socio (semana/mes/lista), eventos puntuales, suspensiones |
| `notificaciones` | `notificar()` (emitir.ts) por evento de dominio → canales in-app / mail (Resend o simulado) / SMS simulado |
| `reportes` | Reportes del club (recaudación, morosidad, ocupación, puntajes) y globales |

## Convenciones

- Código, comentarios, commits y UI en **español**.
- **Multi-tenant:** toda consulta de negocio filtra por `clubId`. Cada page y cada Server Action
  re-verifica acceso con `requireClub` (la API usa `apiClub`): los formularios no son una barrera de seguridad.
- Server Actions vía `ejecutar(ruta, fn)` de `lib/action.ts`; los errores de negocio se lanzan con
  `DomainError` (`lib/errors.ts`) para que lleguen al usuario.
- En acciones del socio, el `socioId` sale siempre de la sesión, nunca del formulario.
- Links internos con `urlClub` / `urlVisible` (`lib/tenant.ts`) para que funcionen con ruta o subdominio.
- Avisos: los servicios llaman a `notificar()` (`notificaciones/emitir.ts`) después de confirmar la transacción; nunca lanza.
- Cambios de modelo: editar `schema.prisma` y crear una migración (`npm run db:migrate`), nunca `db push`.
- Tests de integración: solo contra una base cuyo nombre termine en `_test`.
- Colores de marca con `primario` / `secundario` (`bg-primario text-sobre-primario`, `text-primario-700`,
  `border-secundario`), que toman el tema del club (`lib/tema.ts`, variables `--club-*` en `globals.css`).
  `emerald` queda solo para lo semántico (al día, pagado, cambios guardados), igual que ámbar y rojo.

## Configuración del agente

| Archivo | Para qué |
|---|---|
| `CLAUDE.md` | Este archivo: mapa, comandos y convenciones |
| `.claude/settings.json` | Permisos del proyecto y plugins (lo personal va en `.claude/settings.local.json`, no versionado) |
| `.claude/skills/club-branding/` | Skill propia: tematiza un club desde su logo. `paleta.ts` extrae colores (sharp) y arma la escala con contraste AA validada con `lib/tema.ts`; Claude elige primario y secundario mirando el logo; `aplicar.ts` guarda logo y tema (se niega si `DATABASE_URL` no es local) |

Decisión: el tema se genera con una skill porque elegir el color institucional requiere criterio; la app solo valida y aplica.

## Git

- No pushear sin indicación explícita. `main` despliega en Vercel.
