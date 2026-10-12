# Etapa 3 — Agenda: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** actividades con varios horarios semanales y vigencia, eventos con inscripción/cupo/precio, lista de espera y una pestaña Agenda (semana/mes/lista) para admin y socio.

**Architecture:** las clases se siguen calculando en `calendario/reglas.ts`, ahora desde `HorarioActividad` y la vigencia. `actividades` gana edición y lista de espera; los eventos con inscripción viven en `calendario` (`eventos.service.ts`) y crean cargos con un helper nuevo de `cuenta-corriente`. UI server-side por parámetros de URL, como la etapa 2.

**Tech Stack:** Next.js 15 App Router, Prisma 6 + Postgres, Zod, Vitest (unit + integration), Tailwind 4.

**Spec:** [roadmap-v3, etapa 3](../specs/2026-10-12-roadmap-v3-design.md#etapa-3--agenda)

## Global Constraints

- Toda consulta filtra por `clubId`; servicios reciben `clubId` y `hoy?: Date` para tests.
- Días a medianoche UTC del calendario de Argentina (`inicioDelDia`), horas `"HH:MM"`.
- Errores de negocio con `DomainError` y los textos del spec.
- Sin librerías nuevas. Sin JavaScript de cliente nuevo salvo que sea imprescindible.
- `.env` apunta a Neon de producción: migraciones y seed locales siempre con `DATABASE_URL` explícita a `localhost:5432/gestion_socios`.

## Review Focus

1. Editar los horarios de una actividad con excepciones futuras → las que quedan fuera de un horario se borran; las que siguen siendo válidas se conservan (test en Task 3).
2. Inscripción simultánea al último lugar de un evento con cupo → entra exactamente una (test en Task 4).
3. Reinscribirse a un evento pago después de cancelar → reactiva el cargo anulado, no duplica (test en Task 4).
4. Actividad con `fechaFin` pasada → no aparece en el calendario después del fin ni admite inscripción (tests en Tasks 2 y 3).
5. Migración sobre datos existentes → cada actividad conserva su día, hora y duración como un horario (test en Task 1).

---

### Task 1: Esquema y migración `agenda`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261013090000_agenda/migration.sql`
- Modify: `tests/helpers/factories.ts`
- Test: `tests/integration/migracion-agenda.test.ts`

**Interfaces:**
- Produces: modelos `HorarioActividad`, `InscripcionEvento`, `ListaEspera`; `Actividad.{descripcion, fechaInicio, fechaFin, horarios}`; `Evento.{duracionMin, conInscripcion, cupo, precio}`; `ConceptoCargo.EVENTO`.
- Factories: `crearActividad(clubId, over & { horarios?: {diaSemana, hora, duracionMin?}[]; fechaInicio?; fechaFin? })` (default un horario lunes 18:00 y `fechaInicio` 2026-01-01); `crearEvento` acepta los campos nuevos; `inscribirEventoDirecto(clubId, eventoId, socioId)`; `anotarEsperaDirecto(clubId, socioId, { actividadId? , eventoId? })`.

- [ ] Escribir la migración en dos partes dentro del mismo SQL: crear tablas/columnas (`fechaInicio` nullable), `INSERT INTO "HorarioActividad" SELECT … FROM "Actividad"`, `UPDATE "Actividad" SET "fechaInicio" = date_trunc('day', "createdAt")`, `SET NOT NULL`, y recién después `DROP COLUMN diaSemana, hora, duracionMin`. `ListaEspera` con CHECK de exactamente uno de `actividadId`/`eventoId`.
- [ ] Test `migracion-agenda.test.ts`: lee `migration.sql` y verifica que el `INSERT INTO "HorarioActividad"` y el `UPDATE … "fechaInicio"` preceden a los `DROP COLUMN` (la base de test ya está migrada, el traspaso real se verifica en el paso siguiente).
- [ ] Verificación manual: en la base local `gestion_socios` (seed v2), `npx prisma migrate deploy` con `DATABASE_URL` local → cada actividad tiene un horario igual al viejo y `fechaInicio` = día de creación.
- [ ] Actualizar factories y `prisma generate`. `npm run typecheck` va a fallar en los módulos (se arreglan en Tasks 2–3).
- [ ] Commit al final de la Task 3 (el árbol no compila entre medio).

### Task 2: Reglas puras del calendario

**Files:**
- Modify: `src/modules/calendario/reglas.ts`
- Test: `tests/unit/calendario-reglas.test.ts`

**Interfaces:**
- `interface HorarioCalendario { diaSemana: number; hora: string; duracionMin: number }`
- `interface ActividadCalendario { id; nombre; activa; fechaInicio: Date; fechaFin: Date | null; horarios: HorarioCalendario[] }`
- `clasesEnRango(actividad: Pick<ActividadCalendario,"fechaInicio"|"fechaFin"|"horarios">, desde, hasta): { fecha: Date; horario: HorarioCalendario }[]`
- `horarioDe(actividad, fecha): HorarioCalendario | null` — el horario de ese día si la fecha está en vigencia.
- `EventoCalendario` suma `duracionMin`; los ítems de evento llevan `horaFin`.
- `semanaDe(fecha: Date): Date[]` (lunes a domingo), `lunesDeParam(param?: string, hoy?): Date`.
- `bloquesSemana(items: ItemCalendario[], dias: Date[]): { desdeHora: number; hastaHora: number; bloques: { item; columna: 0..6; inicioMin; duracionMin; carril; carriles }[] }` — rango default 8–22 ampliado a las clases; solapados en carriles.

- [ ] Tests: varios horarios (lunes y miércoles de octubre 2026 → 9 fechas), inicio y fin inclusivos, sin fin, `horarioDe` fuera de vigencia → null; `armarCalendario` usa la duración de cada horario y la reprogramada toma la duración del horario original; evento con `horaFin`; `semanaDe(2026-10-15)` arranca lunes 12; `lunesDeParam("2026-10-14")` → lunes 12, inválido → semana actual; `bloquesSemana`: 18:00 60 min → inicio 600 desde las 8, dos solapados → carriles 0 y 1 de 2, clase a las 7:00 amplía `desdeHora` a 7.
- [ ] Implementar; adaptar los tests existentes de `clasesEnRango` al nuevo retorno.
- [ ] `npm run test:unit` en verde.

### Task 3: Actividades — alta, edición, vigencia, lista de espera

**Files:**
- Modify: `src/modules/actividades/{schema,service,actions}.ts`, `src/modules/calendario/service.ts`
- Create: `src/modules/actividades/lista-espera.service.ts`
- Test: `tests/integration/actividades.test.ts`, `tests/integration/lista-espera.test.ts`, `tests/unit/validation.test.ts`, `tests/integration/calendario-*.test.ts`

**Interfaces:**
- `actividadSchema`: `{ nombre, descripcion?, fechaInicio: dia, fechaFin?: dia, cupo, arancel, horarios: {diaSemana, hora, duracionMin}[] (1..7, días distintos) }` + `horariosDeFormulario(form: Record<string, unknown>)` que arma `horarios` desde `dia_<n>=on`, `hora_<n>`, `duracion_<n>`.
- `crearActividad(clubId, input)`, `editarActividad(clubId, actividadId, input, hoy?) → { excepcionesBorradas: number }`, `cambiarEstadoActividad(clubId, actividadId, activa)`.
- `inscribir` rechaza si `fechaFin < hoy` ("La actividad ya finalizó") y borra la entrada de lista de espera del socio. `cancelarInscripcion` devuelve `{ liberado: boolean }` (true si la actividad estaba llena).
- `lista-espera.service.ts`: `anotarEnEspera(clubId, socioId, { actividadId } | { eventoId })`, `salirDeEspera(clubId, socioId, ref)`, `enEspera(clubId, ref): socioId[]`. Errores: "Todavía hay lugar: inscribite directamente", "Ya estás inscripto", "Ya estás en la lista de espera", "No estabas en la lista de espera".
- `calendario/service.ts`: `claseModificable` y `obtenerClase` usan `horarioDe`; `reprogramarClase` compara contra la hora del horario.

- [ ] Tests: crear con 2 horarios; días repetidos / fin < inicio / sin horarios rechazados; editar cupo < inscriptos → "El cupo no puede ser menor a los inscriptos (N)"; editar horarios borra solo excepciones futuras huérfanas (y devuelve cuántas) y conserva las pasadas; inscripción con fin pasado rechazada; inscripción saca de la lista; lista de espera (solo lleno, sin duplicados, inscripto no puede, salir); cancelar con actividad llena → `liberado: true`.
- [ ] Implementar; adaptar tests de calendario y validación existentes.
- [ ] `npm test` y `npm run typecheck` (salvo páginas, que se rehacen en Tasks 5–6: se adaptan lo mínimo para compilar).
- [ ] Commit "Actividades con varios horarios, vigencia y lista de espera".

### Task 4: Eventos con inscripción, cupo y precio

**Files:**
- Create: `src/modules/calendario/eventos.service.ts` (mueve `crearEvento`, `eliminarEvento`, `obtenerEvento` desde `service.ts`)
- Modify: `src/modules/calendario/schema.ts`, `src/modules/cuenta-corriente/cargos.service.ts`
- Test: `tests/integration/eventos.test.ts`

**Interfaces:**
- `eventoSchema` suma `duracionMin` (15–600, 60), `conInscripcion` (checkbox "on"), `cupo?` (1–5000), `precio` (0–10.000.000). Sin inscripción → cupo null y precio 0.
- `inscribirEvento(clubId, eventoId, socioId, hoy?) → { cargo: {id, monto} | null }` (serializable), `cancelarInscripcionEvento(clubId, eventoId, socioId, hoy?) → { liberado }`, `eventosParaSocio(clubId, socioId, hoy)` (próximos con inscripción, con `inscriptos`, `inscripto`, `enEspera`), `eliminarEvento` anula cargos pendientes ("Evento cancelado").
- `cargos.service.ts`: `claveEvento(id)`, `cargoPorEvento(tx, clubId, socioId, evento, hoy)` (crea con período actual y vencimiento = fecha del evento, o reactiva el anulado de esa clave), `anularCargoEvento(tx, clubId, socioId, eventoId, motivo)`.
- Errores: "Evento no encontrado", "Este evento no admite inscripción", "El evento ya pasó" (inscribir/cancelar desde el día del evento), "No hay cupo disponible", "Ya estás inscripto en este evento", "No estabas inscripto".
- El socio solo ve/inscribe eventos para todo el club o de sus actividades.

- [ ] Tests: inscripción gratis sin cupo; con precio crea cargo `EVENTO` con vencimiento = fecha del evento; cupo lleno; 5 simultáneas con cupo 1 → una; cancelar anula pendiente y no toca pagado; reinscribir reactiva; día del evento bloqueado; evento de actividad ajena no inscribible; eliminar anula pendientes; aislamiento por club.
- [ ] Implementar. `npm test` en verde. Commit "Eventos con inscripción, cupo y precio".

### Task 5: Pestaña Agenda del admin

**Files:**
- Create: `src/app/c/[slug]/admin/agenda/page.tsx`, `src/modules/calendario/components/{CalendarioSemana,NavegacionSemana,SelectorVista,FormActividad,FormEvento}.tsx`
- Modify: `src/app/c/[slug]/admin/layout.tsx` (pestaña "Agenda" reemplaza "Actividades" y "Calendario"), `src/modules/calendario/actions.ts`, `src/modules/actividades/actions.ts`
- Replace: `admin/actividades/page.tsx` y `admin/calendario/page.tsx` → `redirect` a `agenda`

**Interfaces:**
- URL: `?vista=semana|mes|lista` (default semana), `semana=YYYY-MM-DD`, `mes=YYYY-MM`, `nuevo=actividad|evento`, `clase=<id>:<fecha>`, `evento=<id>`, `actividad=<id>`.
- `CalendarioSemana({ dias, items, hoy, hrefItem })` usa `bloquesSemana`; filas de 48px por hora, bloques absolutos; oculto bajo `md` (se muestra `AgendaLista`).
- Actions vuelven a la misma vista: `rutaAgenda(slug, query)`.

- [ ] Implementar página y componentes; acciones nuevas `editarActividadAction`, `cambiarEstadoActividadAction`.
- [ ] `npm run typecheck`, `npm run build`.
- [ ] Verificar en el navegador con la base local (vista semana, mes, lista; crear actividad con 3 días; crear evento pago; seleccionar clase y suspender; editar actividad).
- [ ] Commit "Pestaña Agenda del admin con vistas semana, mes y lista".

### Task 6: Agenda del socio

**Files:**
- Create: `src/app/c/[slug]/socio/agenda/page.tsx`
- Modify: `src/app/c/[slug]/socio/page.tsx` (sin tabla de actividades; link a Agenda), `socio/calendario/page.tsx` → redirect, header/navegación del socio, `src/modules/actividades/actions.ts` (inscribir/cancelar vuelven a la agenda), acciones de evento y lista de espera.

- [ ] Vistas semana/mes de `calendarioSocio`; card "Actividades y eventos del club" con Inscribirme / Cancelar / Anotarme en lista de espera / Salir de la lista; días y horarios formateados ("Lun y Mié 19:00–20:00").
- [ ] Typecheck, build, verificación en navegador como socio. Commit "Agenda del socio con inscripción a eventos y lista de espera".

### Task 7: Seed y demo

**Files:** `prisma/seed.ts`, `prisma/escenario-demo.ts`, `tests/unit/escenario-demo.test.ts`, `README.md` (sección calendario → agenda)

- [ ] Natación lunes y miércoles 19:00 (cupo 2); Fútbol infantil lunes 18:00; Yoga martes y jueves 10:00 con cupo 2 lleno (Martín y Valentina) y Lucía en lista de espera; "Clínica de natación" gratis con cupo 10; "Cena anual" $15.000 sin cupo; excepciones de Fútbol como hoy.
- [ ] Seed contra la base local, flujo de demo del spec en el navegador.
- [ ] `npm test`, typecheck, build. Commit "Seed y demo de la agenda".
