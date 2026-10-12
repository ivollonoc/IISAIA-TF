# Roadmap v3 — Agenda, notificaciones, acceso, socios, reportes y subdominios

Fecha: 2026-10-12 · Estado: aprobado · Reemplaza las etapas 3–5 de [roadmap-v2](2026-10-12-roadmap-v2-design.md) · Rama: `mvp3`

## Objetivo

Redondear la app para la demo del TP: una agenda única de actividades y eventos (con inscripción y lista de espera), notificaciones por varios canales, ingreso sin Google con invitaciones por mail, alta masiva y grupo familiar de socios, reportes y subdominio por club.

**Contexto:** proyecto académico orientado a demo. Pagos, mails y SMS son **simulados** detrás de interfaces que permiten enchufar un proveedor real (como `Pasarela` en la etapa 1).

**Criterio de éxito:** cada etapa cierra con typecheck, tests y build en verde, y su flujo de demo funcionando con el seed sin preparación manual.

## Etapas

| # | Etapa | Depende de |
|---|---|---|
| 3 | Agenda: actividades con varios días e inicio/fin, eventos con inscripción, vista semanal, lista de espera | — |
| 4 | Notificaciones: bandeja in-app, mail y SMS simulados, canales por club | 3 |
| 5 | Acceso: login en el home, invitaciones y link mágico por mail, sin Google | 4 |
| 6 | Socios: importar CSV y grupo familiar | 5 |
| 7 | Reportes y puntaje de actividades | 3, 6 |
| 8 | Subdominio por club detrás de flag + página pública del club | 5 |

Cada etapa: migración Prisma nueva + seed actualizado + tests (unitarios de reglas puras e integración contra Postgres real) + commit en `mvp3`.

## Decisiones

| # | Tema | Decisión |
|---|---|---|
| 1 | Actividad vs evento | Se distinguen por la **recurrencia**: la actividad tiene horarios semanales, fecha de inicio y fin opcional, e inscripción **mensual**; el evento es **puntual**. |
| 2 | Clases | Se siguen **calculando** desde los horarios; solo se guardan excepciones. No hay tabla de clases. |
| 3 | Eventos | Inscripción opcional, **cupo opcional** y **precio opcional** (genera un cargo único en la cuenta corriente). |
| 4 | Lista de espera | Para actividades y eventos llenos. Al liberarse un lugar se avisa a **todos** los de la lista; nadie se inscribe automáticamente. |
| 5 | Emisión de notificaciones | **Llamada directa** desde los servicios, después de confirmar la transacción. Un error al notificar se registra y no rompe la operación. Sin bus de eventos. |
| 6 | Canales | In-app siempre. Mail y SMS **por club** (el admin del club los activa). Mail con Resend si hay `RESEND_API_KEY`; si no, simulado. SMS siempre simulado. Lo simulado queda en un **buzón de salida** visible en la app. |
| 7 | Acceso | Sin Google. Usuarios **demo** (marcados en la base) entran sin contraseña; el resto con **link mágico** por mail. El alta de un club o de un socio con email envía una **invitación**. |
| 8 | Grupo familiar | Un nivel: un socio puede tener un **titular** del mismo club. El titular ve y paga los cargos de su grupo. La generación de cargos no cambia. |
| 9 | Reportes | Gráficos con **Tremor Raw** (componentes copiados al repo, sobre Recharts). Sin export CSV. Rango por URL (últimos 6 o 12 meses). |
| 10 | Subdominios | Flag `TENANT_MODE=path|subdomain`. En `subdomain`, un middleware reescribe `<slug>.<ROOT_DOMAIN>` a `/c/<slug>`. |
| 11 | Fuera de alcance | Carnet digital con QR y asistencia (idea anotada), preferencias de notificación por socio, push del navegador, cron de vencimientos. |

---

## Etapa 3 — Agenda

### Modelo

```prisma
model Actividad {
  // se van: diaSemana, hora, duracionMin
  descripcion String?
  fechaInicio DateTime            // medianoche UTC; las clases empiezan ese día
  fechaFin    DateTime?           // null = sin fin; incluye ese día
  horarios    HorarioActividad[]
  listaEspera ListaEspera[]
  puntajes    Puntaje[]           // etapa 7
}

// Un horario por día de la semana como máximo: (actividadId, fecha) sigue identificando una clase.
model HorarioActividad {
  id          String    @id @default(cuid())
  actividadId String    // onDelete: Cascade
  diaSemana   Int       // 0 = domingo ... 6 = sábado
  hora        String    // "HH:MM"
  duracionMin Int       @default(60)

  @@unique([actividadId, diaSemana])
}

model Evento {
  // se suman:
  duracionMin  Int      @default(60)
  conInscripcion Boolean @default(false)
  cupo         Int?     // null = sin límite (solo si conInscripcion)
  precio       Int      @default(0) // pesos; > 0 genera cargo (solo si conInscripcion)
  inscripciones InscripcionEvento[]
  listaEspera   ListaEspera[]
}

model InscripcionEvento {
  id       String @id @default(cuid())
  clubId   String
  eventoId String // onDelete: Cascade
  socioId  String // onDelete: Cascade
  createdAt DateTime @default(now())
  @@unique([eventoId, socioId])
}

// Exactamente uno de actividadId / eventoId.
model ListaEspera {
  id          String  @id @default(cuid())
  clubId      String
  socioId     String
  actividadId String?
  eventoId    String?
  createdAt   DateTime @default(now())
  @@unique([socioId, actividadId])
  @@unique([socioId, eventoId])
}

enum ConceptoCargo { CUOTA ACTIVIDAD EVENTO }
```

**Migración `agenda`:** crea `HorarioActividad` a partir de `diaSemana`/`hora`/`duracionMin` de cada actividad, copia `createdAt` (a medianoche) en `fechaInicio` y recién después borra las columnas viejas. Neon: se aplica con `db:deploy` + seed.

### Reglas

- **Clases de una actividad** = para cada día del rango entre `fechaInicio` y `fechaFin`, si hay un horario para ese día de la semana. Excepciones igual que en la etapa 2.
- **Alta/edición de actividad:** nombre (2–60), descripción opcional, 1 a 7 horarios (días distintos), fecha de inicio, fin opcional (≥ inicio), cupo ≥ 1, arancel ≥ 0.
  - Editar el cupo por debajo de los inscriptos actuales: `DomainError("El cupo no puede ser menor a los inscriptos (N)")`.
  - Si cambian horarios o fechas, las excepciones de clases futuras que ya no caen en un horario se **borran** (y se informa cuántas).
  - Cambiar el arancel afecta solo los cargos que se generen desde ahora.
- **Inscripción a actividad:** además de lo actual, no se puede inscribir si `fechaFin` ya pasó. Al inscribirse, sale de la lista de espera.
- **Evento con inscripción:** solo si `conInscripcion`; no se puede inscribir ni cancelar a partir del día del evento. Con `precio > 0` se crea un cargo `EVENTO` (clave `EVT:<eventoId>`, período del día de inscripción, vence el día del evento). Cancelar anula el cargo si está pendiente; lo pagado no se reintegra. Reinscribirse reactiva el anulado.
- **Lista de espera:** solo si está lleno y el socio no está inscripto ni en la lista. Se puede salir. Al cancelar una inscripción (actividad o evento) → notificación "Se liberó un lugar" a todos los de la lista (etapa 4; en esta etapa queda el punto de enganche).
- **Eliminar evento:** si tiene inscriptos con cargos pendientes, se anulan ("Evento cancelado").

### Pantallas

**Admin del club — una sola pestaña "Agenda"** (reemplaza "Actividades" y "Calendario"; las rutas viejas redirigen):

- Selector de vista por URL: **Semana** (default) · **Mes** · **Lista**.
  - **Semana** (`?semana=YYYY-MM-DD` = lunes): grilla de 7 columnas por horas (rango según las clases de la semana, 8 a 22 por defecto), cada clase o evento es un bloque posicionado por hora y duración, con color por estado. En celular pasa a `AgendaLista`.
  - **Mes:** el `CalendarioMes` actual.
  - **Lista:** tabla de actividades (días y horarios, vigencia, arancel, inscriptos/cupo, en espera) y de próximos eventos (fecha, inscriptos/cupo, precio).
- Columna lateral:
  - **Nuevo** con selector **Actividad | Evento** (`?nuevo=actividad|evento`): el formulario cambia según el tipo. Actividad: 7 checkboxes de días, cada uno con hora y duración. Evento: fecha, hora, duración, lugar, destinatarios, y "Permite inscripción" con cupo y precio.
  - **Seleccionado:** clase (suspender/reprogramar/restablecer, como hoy), actividad (editar, desactivar, inscriptos y lista de espera) o evento (detalle, inscriptos, eliminar).
- Sin JavaScript de cliente salvo lo ya existente; todo por parámetros de URL y server actions.

**Socio — pestaña "Agenda"** (`/c/[slug]/socio/agenda`, reemplaza `socio/calendario`):

- Vistas Semana/Mes de su calendario (sus actividades y eventos que le corresponden).
- **"Actividades y eventos del club"**: actividades con días y horarios, y próximos eventos con inscripción; botones Inscribirme / Cancelar / Anotarme en lista de espera / Salir de la lista.
- La home del socio mantiene "Próximos 7 días" y cambia la tabla de actividades por un link a la Agenda.

### Tests

- Unitarios: clases con varios horarios, con inicio y fin, `semanaDe(fecha)`, layout de bloques de la vista semanal (posición y alto).
- Integración: crear/editar actividad (horarios repetidos, fin < inicio, cupo < inscriptos, excepciones huérfanas borradas); inscripción fuera de vigencia; eventos con inscripción (cupo, cargo, cancelar anula, reinscripción reactiva, día del evento bloqueado); lista de espera (solo lleno, no duplicada, sale al inscribirse); eliminar evento anula cargos.

### Seed y demo

Natación lunes y miércoles; Yoga martes y jueves con cupo lleno y un socio en lista de espera; un evento gratis con cupo ("Clínica de natación") y uno pago ("Cena anual", $15.000).
Demo: el admin crea "Funcional" (lunes, miércoles y viernes 19:00) desde la vista semanal; el socio se inscribe a la cena (aparece el cargo) y se anota en la lista de espera de Yoga.

---

## Etapa 4 — Notificaciones

### Modelo

```prisma
enum CanalAviso { IN_APP EMAIL SMS }

model Notificacion {            // bandeja in-app
  id        String    @id @default(cuid())
  usuarioId String    // onDelete: Cascade
  clubId    String?
  tipo      String    // "PAGO_ACREDITADO", "CLASE_SUSPENDIDA", ...
  titulo    String
  cuerpo    String
  link      String?
  leidaAt   DateTime?
  createdAt DateTime  @default(now())
  @@index([usuarioId, leidaAt])
}

model MensajeSaliente {         // buzón de salida de mail/SMS simulados (y log de los reales)
  id        String     @id @default(cuid())
  clubId    String?
  canal     CanalAviso // EMAIL | SMS
  destino   String     // email o teléfono
  asunto    String?
  cuerpo    String
  proveedor String     // "simulado" | "resend"
  createdAt DateTime   @default(now())
}

model Club  { canales CanalAviso[] @default([IN_APP]) }
model Socio { telefono String? }
```

### Arquitectura

```
src/modules/notificaciones/
  canales/canal.ts        interface Canal { enviar(destinatario, mensaje) }
  canales/in-app.ts       crea Notificacion (requiere usuario)
  canales/email.ts        Resend si RESEND_API_KEY; si no, MensajeSaliente
  canales/sms.ts          siempre MensajeSaliente
  destinatarios.ts        socios del club / inscriptos de actividad o evento / lista de espera / admins de club
  emitir.ts               notificar(evento de dominio) → arma mensaje, resuelve destinatarios y canales del club
  service.ts              bandeja: listar, contarNoLeidas, marcarLeida, marcarTodas; avisos manuales
```

Los servicios llaman `notificar(...)` después del commit. `notificar` nunca lanza: captura y registra el error.

### Eventos que notifican

| Evento | Destinatarios |
|---|---|
| Pago acreditado (online o ventanilla) | el socio (y el titular si lo pagó él, etapa 6) |
| Cargos del período generados | cada socio con cargos nuevos ("Tenés $X a pagar, vence el dd/mm") |
| Clase suspendida / reprogramada / restablecida | inscriptos de la actividad |
| Actividad nueva | todos los socios activos |
| Actividad editada (horarios o fechas) | inscriptos |
| Evento nuevo / eliminado | todo el club o inscriptos de la actividad; si se elimina, los inscriptos al evento |
| Se liberó un lugar | todos los de la lista de espera |
| Aviso manual del admin de club | todos los socios o los inscriptos de una actividad |
| Aviso manual del admin general | admins de club (todos o uno) |

Canales: in-app siempre; mail si el club lo activó y el usuario tiene email; SMS si el club lo activó y el socio tiene teléfono. Los avisos del admin general a admins de club van por in-app y mail.

### Pantallas

- **Campana** en el header con contador de no leídas (los tres roles) → página **Avisos** con la bandeja (no leídas primero, marcar leída al abrir o "marcar todas").
- **Admin del club:** en Configuración, checkboxes de canales (in-app fijo); pestaña **Avisos** con formulario de aviso manual (asunto, mensaje, destinatarios) y el **buzón de salida** del club (mails/SMS simulados).
- **Admin general:** formulario de aviso a admins de club y buzón de salida global.

### Tests

Unitarios de armado de mensajes; integración de cada evento → destinatarios correctos, canales según el club, `notificar` no rompe si un canal falla, bandeja (no leídas, marcar), aislamiento por club.

---

## Etapa 5 — Acceso

### Modelo

```prisma
model Usuario { demo Boolean @default(false) }

model TokenAcceso {
  id        String   @id @default(cuid())
  usuarioId String   // onDelete: Cascade
  hash      String   @unique   // sha256 del token; el token solo viaja en el link
  tipo      String   // "INVITACION" | "LOGIN"
  expira    DateTime // invitación 7 días, login 15 minutos
  usadoAt   DateTime?
}
```

### Flujo

- **Home = landing + login.** Un solo campo de email. Botones rápidos "Admin general / Admin club / Socio" que ingresan con los usuarios demo.
- Email de usuario **demo** → entra directo (provider `demo`, solo `Usuario.demo = true`).
- Otro email registrado → se envía un **link mágico** (`/ingresar/<token>`, 15 min, un uso) por el canal de mail. La pantalla dice "Te mandamos un link a …". Email no registrado → el mismo mensaje (no revela si existe).
- **Invitaciones:** al crear un club se invita a su admin; al crear un socio con email (o cambiarle el email) se lo invita. El link (7 días) inicia sesión y lleva a su panel. El admin puede **reenviar invitación**.
- Se elimina el provider de Google y `SUPERADMIN_EMAIL` pasa a crear el usuario superadmin en el seed.
- Con mail simulado (sin `RESEND_API_KEY`), los links quedan en el buzón de salida, visible solo para el admin general y el admin del club correspondiente. En la demo se usa el usuario demo; para mostrar el link mágico se abre el buzón.

### Tests

Token: hash, vencimiento, un solo uso, tipo. Demo solo para usuarios marcados. Invitación al crear club/socio. Email inexistente no revela nada.

---

## Etapa 6 — Socios

### Importar CSV

- Pestaña Socios → "Importar". Se sube un CSV (`nombre,apellido,dni,email,telefono,tipo`; separador `,` o `;`; UTF-8 con o sin BOM; hasta 500 filas).
- **Paso 1 — vista previa:** tabla con cada fila marcada como válida o con su error (campo faltante, DNI repetido en el archivo o en el club, tipo inexistente, email en uso). Nada se guarda.
- **Paso 2 — confirmar:** importa **todas o ninguna** (si hay errores no deja confirmar). Checkbox "Enviar invitación a los que tienen email".
- Parser propio (comillas, separadores), sin dependencias.

### Grupo familiar

```prisma
model Socio {
  titularId String?   // mismo club; onDelete: SetNull
  titular   Socio?    @relation("GrupoFamiliar", ...)
  familiares Socio[]  @relation("GrupoFamiliar")
}
```

- Un nivel: el titular no puede tener titular, y un socio con familiares no puede pasar a ser familiar. Mismo club.
- El admin asigna el titular desde la ficha del socio (selector con búsqueda simple).
- **Titular:** su home muestra "Mi grupo familiar" (integrantes, estado de cada uno) y su cuenta corriente incluye los cargos del grupo (columna "Socio"); puede pagar cualquier cargo del grupo, online o seleccionándolos.
- **Familiar:** ve su propia cuenta; si tiene usuario, puede pagar lo suyo.
- "Al día" sigue siendo por socio.

### Tests

Parser (comillas, `;`, BOM, filas vacías), validación de filas, importación todo-o-nada; grupo (un nivel, mismo club, ciclos), titular paga cargos del grupo, no puede pagar cargos de otro socio fuera del grupo.

---

## Etapa 7 — Reportes y puntajes

### Puntajes

```prisma
model Puntaje {
  id          String  @id @default(cuid())
  clubId      String
  actividadId String  // onDelete: Cascade
  socioId     String  // onDelete: Cascade
  medias      Int     // medias estrellas: 1..10 (9 = 4,5 estrellas)
  comentario  String? // hasta 280
  updatedAt   DateTime @updatedAt
  @@unique([actividadId, socioId])
}
model Socio { bajaAt DateTime? }  // se setea al dar de baja; altas = createdAt
```

Puntaje de 0,5 a 5 estrellas en pasos de media (se guarda en medias para evitar decimales). Solo puntúa un socio inscripto; puede cambiar su puntaje. En la Agenda del socio, estrellas en cada actividad inscripta; el admin ve promedio y comentarios en el detalle de la actividad.

### Reportes

Pestaña **Reportes** del admin del club (`?meses=6|12`):

- **KPIs:** socios activos, recaudado en el mes, deuda vencida total, % socios al día.
- **Recaudación por mes:** emitido vs cobrado (barras).
- **Morosidad:** socios con deuda vencida y monto, top 10.
- **Ocupación por actividad:** inscriptos/cupo y en lista de espera (barras horizontales).
- **Puntaje por actividad:** promedio y cantidad de votos.
- **Altas y bajas por mes.**

Admin general, sección **Reportes**: clubes, socios activos, recaudación por club y mes, morosidad por club.

Agregados calculados en consulta (Prisma `groupBy` / SQL), en `src/modules/reportes/service.ts`. Componentes Tremor Raw en `src/components/tremor/` (dependencia: `recharts`).

### Tests

Integración de cada agregado con datos armados (incluye aislamiento por club y rango de meses).

---

## Etapa 8 — Subdominios

- Variables: `TENANT_MODE=path|subdomain` (default `path`), `ROOT_DOMAIN` (`clubdesocios.com.ar`; en local `localhost:3000`).
- **Middleware** (solo con `subdomain`): `<slug>.<ROOT_DOMAIN>/<ruta>` → reescritura interna a `/c/<slug>/<ruta>`; el dominio raíz sirve la landing y `/admin`. Un subdominio desconocido → 404.
- **Helper `urlClub(slug, ruta)`** para todos los links y redirecciones (en `path` devuelve `/c/<slug>/<ruta>`; en `subdomain` la URL del subdominio).
- **Página pública del club** (`/c/[slug]`, en ambos modos): nombre, actividades con horarios, próximos eventos y botón Ingresar.
- **Login:** en un subdominio solo entran usuarios de ese club ("Ese email no pertenece a <club>"). En el dominio raíz entra cualquiera y se lo redirige a su club.
- **Sesión:** cookie de NextAuth con `domain=.<ROOT_DOMAIN>` en modo `subdomain`; `serverActions.allowedOrigins` con `*.<ROOT_DOMAIN>`.
- **Local:** `demo.localhost:3000` y `atlas.localhost:3000` (sin DNS).
- **Infraestructura (fuera del código, documentada en el README):** en Vercel agregar `clubdesocios.com.ar` y `*.clubdesocios.com.ar` al proyecto (Hobby lo permite, hasta 50 dominios); en NIC.ar delegar el dominio a `ns1.vercel-dns.com` / `ns2.vercel-dns.com`; setear `TENANT_MODE=subdomain` y `ROOT_DOMAIN` en Vercel.

### Tests

Unitarios de resolución de tenant por host (raíz, subdominio, `www`, localhost, preview de Vercel) y de `urlClub` en ambos modos.

---

## Riesgos

- La etapa 3 cambia el modelo de actividades que usan cuenta corriente y calendario: se hace primero y con migración de datos.
- Neon no se actualiza con git: al publicar `mvp3` hay que correr `db:deploy` y el seed.
- Resend solo envía a cualquier destinatario con un dominio verificado; con `clubdesocios.com.ar` en Vercel se pueden agregar sus registros DNS. Mientras tanto, mail simulado.
