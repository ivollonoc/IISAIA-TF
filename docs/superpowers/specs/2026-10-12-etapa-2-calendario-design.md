# Etapa 2 — Calendario de actividades

Fecha: 2026-10-12 · Estado: diseño aprobado · Roadmap: [roadmap-v2](2026-10-12-roadmap-v2-design.md) · Depende de: [etapa 0](2026-10-12-etapa-0-base-design.md), [etapa 1](2026-10-12-etapa-1-cuenta-corriente-design.md)

## Objetivo

Que admin y socios vean las clases reales de cada semana y mes a partir de la regla semanal de cada actividad, con sus excepciones (clases suspendidas o reprogramadas) y los eventos puntuales del club.

**Criterio de éxito:** el flujo de demo descrito al final funciona de punta a punta con el seed, sin preparación manual.

## Decisiones

| # | Tema | Decisión |
|---|---|---|
| 1 | Propósito | Agenda con excepciones. La inscripción sigue siendo **mensual a la actividad** (de ahí sale el arancel de la etapa 1). Sin reservas por clase ni control de asistencia. |
| 2 | Eventos puntuales | **Solo informativos**: título, fecha, hora, lugar, descripción y destinatarios (todo el club o los inscriptos de una actividad). Sin inscripción, cupo ni costo. |
| 3 | Suspensiones y cobro | Una clase suspendida **no afecta** el arancel ni la cuenta corriente. |
| 4 | Modelo | Las clases se **calculan al vuelo** desde la regla semanal. Solo se guardan las excepciones (`ExcepcionClase`) y los eventos (`Evento`). |
| 5 | Interfaz | Grilla mensual y lista de agenda con Tailwind y los componentes actuales, **sin librería de calendario** y sin JavaScript de cliente: navegación y selección por parámetros de la URL. |
| 6 | Fechas | Los días se guardan a medianoche UTC y se calculan con el calendario de Argentina (`fechaLocal`/`inicioDelDia`, etapa 1). Las horas son `"HH:MM"` en hora local. |

## Modelo de datos

```prisma
model Actividad {
  // ...
  duracionMin Int @default(60)   // para mostrar "18:00–19:00"
  excepciones ExcepcionClase[]
  eventos     Evento[]
}

enum TipoExcepcion {
  SUSPENDIDA
  REPROGRAMADA
}

// Lo único que se guarda de las clases: lo que se aparta de la regla semanal.
model ExcepcionClase {
  id          String        @id @default(cuid())
  clubId      String        // relación con Club, onDelete: Cascade
  actividadId String        // relación con Actividad, onDelete: Cascade
  fecha       DateTime      // día original de la clase (medianoche UTC)
  tipo        TipoExcepcion
  nuevaFecha  DateTime?     // solo REPROGRAMADA (medianoche UTC)
  nuevaHora   String?       // "HH:MM", solo REPROGRAMADA
  motivo      String
  createdAt   DateTime      @default(now())

  @@unique([actividadId, fecha])
  @@index([clubId, fecha])
  @@index([clubId, nuevaFecha])
}

model Evento {
  id          String    @id @default(cuid())
  clubId      String    // relación con Club, onDelete: Cascade
  titulo      String
  descripcion String?
  fecha       DateTime  // medianoche UTC
  hora        String    // "HH:MM"
  lugar       String?
  actividadId String?   // null = todo el club; si no, solo los inscriptos (onDelete: Cascade)
  createdAt   DateTime  @default(now())

  @@index([clubId, fecha])
}
```

`Club` suma las relaciones `excepcionesClase` y `eventos`. Migración nueva `calendario`, que se genera y aplica igual que en la etapa 1 (`migrate diff --from-schema-datasource` + `db:deploy`).

## Arquitectura

```
src/modules/calendario/
  reglas.ts      puras:
                 clasesEnRango(actividad, desde, hasta): Date[]
                 horaFin(hora, duracionMin): string        ("23:30" + 60 → "00:30")
                 armarCalendario({ actividades, excepciones, eventos, desde, hasta }): ItemCalendario[]
                 semanasDelMes(periodo): Date[][]          (grilla lunes a domingo)
  service.ts     calendarioClub(clubId, desde, hasta)
                 calendarioSocio(clubId, socioId, desde, hasta)
                 suspenderClase(clubId, input, hoy?) · reprogramarClase(clubId, input, hoy?)
                 restablecerClase(clubId, excepcionId, hoy?)
                 crearEvento(clubId, input, hoy?) · eliminarEvento(clubId, eventoId)
  schema.ts · actions.ts
  components/    CalendarioMes · AgendaLista · NavegacionMes
```

`ItemCalendario`:

```ts
type EstadoItem = "NORMAL" | "SUSPENDIDA" | "MOVIDA" | "REPROGRAMADA";
interface ItemCalendario {
  tipo: "CLASE" | "EVENTO";
  fecha: Date;              // medianoche UTC del día en que se muestra
  hora: string;
  horaFin?: string;         // clases
  titulo: string;           // nombre de la actividad o título del evento
  estado: EstadoItem;
  motivo?: string;          // SUSPENDIDA / MOVIDA / REPROGRAMADA
  fechaOriginal?: Date;     // REPROGRAMADA: de dónde viene
  destino?: { fecha: Date; hora: string }; // MOVIDA: adónde va
  actividadId?: string;
  excepcionId?: string;
  eventoId?: string;
  lugar?: string;
  descripcion?: string;
}
```

**Dependencias:** `calendario` lee actividades, inscripciones, excepciones y eventos con Prisma, siempre filtrando por `clubId`. No depende de `cuenta-corriente`, y `actividades` no depende de `calendario`. La etapa 3 (notificaciones) va a engancharse en `suspenderClase`, `reprogramarClase` y `crearEvento`.

## Reglas

### Armado del calendario

1. **Clases de la regla:** para cada actividad **activa**, las fechas del rango cuyo día de la semana (calendario de Argentina) es `diaSemana`, a partir del día de creación de la actividad. Hora de fin = `hora + duracionMin` (puede pasar de medianoche).
2. **Excepciones:**
   - `SUSPENDIDA` → la clase se muestra en su fecha con estado `SUSPENDIDA` y el motivo.
   - `REPROGRAMADA` → dos ítems, cada uno solo si su fecha cae dentro del rango:
     - en la fecha original, estado `MOVIDA` con `destino`;
     - en la fecha nueva, estado `REPROGRAMADA` con `fechaOriginal`.
   - El servicio busca las excepciones cuya `fecha` **o** `nuevaFecha` está en el rango.
3. **Eventos:** los del rango, con estado `NORMAL`.
4. **Orden:** por fecha y después por hora.

### Alcance por rol

- **Admin del club:** todas las actividades activas y todos los eventos del club.
- **Socio:** las clases de las actividades activas en las que está inscripto, más los eventos para todo el club (`actividadId` null) y los de esas actividades.
- **Rango máximo:** 6 semanas (42 días) por consulta; si se pide más, `DomainError("El rango máximo es de 6 semanas")`.

### Operaciones del admin

| Operación | Reglas | Error (`DomainError`) |
|---|---|---|
| `suspenderClase({ actividadId, fecha, motivo })` | Actividad del club y activa. La fecha es una clase de la regla (día de la semana correcto y no anterior a la creación) y no es pasada. Sin otra excepción para esa clase. | "Actividad no encontrada" · "Esa fecha no corresponde a una clase de la actividad" · "No se pueden modificar clases pasadas" · "Esa clase ya tiene un cambio: restablecela primero" |
| `reprogramarClase({ actividadId, fecha, nuevaFecha, nuevaHora, motivo })` | Lo mismo, más: `nuevaFecha` no es pasada y el par (`nuevaFecha`, `nuevaHora`) es distinto del original. | además: "La nueva fecha no puede ser pasada" · "Elegí una fecha u hora distinta" |
| `restablecerClase(excepcionId)` | La excepción es del club y su fecha original no es pasada. Borra la excepción. | "Cambio no encontrado" · "No se pueden modificar clases pasadas" |
| `crearEvento({ titulo, fecha, hora, lugar?, descripcion?, actividadId? })` | Fecha no pasada. Si tiene `actividadId`, la actividad es del club. | "La fecha no puede ser pasada" · "Actividad no encontrada" |
| `eliminarEvento(eventoId)` | El evento es del club. | "Evento no encontrado" |

- "Hoy" = `inicioDelDia()` (Argentina); "pasada" = fecha anterior a hoy (hoy se puede modificar).
- Validación Zod: `motivo` de 2 a 200 caracteres; `titulo` de 2 a 80; `fecha` y `nuevaFecha` con formato `YYYY-MM-DD`; `hora` y `nuevaHora` con `HH:MM`; `lugar` hasta 80 caracteres y `descripcion` hasta 500, ambos opcionales; `duracionMin` de 15 a 600, con 60 por defecto.
- El cupo y la inscripción mensual no cambian.

## Pantallas

Componentes y paleta actuales (esmeralda/slate; ámbar y rojo solo para estados). Sin JavaScript de cliente.

### Componentes

- **`CalendarioMes`:** grilla lunes a domingo del mes (`semanasDelMes`). Cada día lista sus ítems ("18:00 Natación"). Estilos: clase normal en slate; `SUSPENDIDA` en rojo tachado; `MOVIDA` en gris tachado con "→ dd/mm hh:mm"; `REPROGRAMADA` en ámbar; evento en esmeralda. El día de hoy se resalta y los días de otros meses se atenúan. Recibe `hrefItem?(item)` para que los ítems sean links. Se oculta debajo de `md`.
- **`AgendaLista`:** los mismos ítems agrupados por día ("Mié 15/10 · 19:00–20:00 Natación · Suspendida: feriado"). Se usa en celular (visible debajo de `md`) y en la home del socio.
- **`NavegacionMes`:** "← sep 2026 · octubre 2026 · nov 2026 →" con `?mes=YYYY-MM` (por defecto, el mes actual; un valor inválido vuelve al actual).

### Admin del club — pestaña "Calendario" (`/c/[slug]/admin/calendario`)

- **Columna principal (2/3):** `NavegacionMes` + `CalendarioMes`/`AgendaLista`. Ítems con link: `?mes=…&clase=<actividadId>:<YYYY-MM-DD>` (fecha original de la clase) o `?mes=…&evento=<id>`.
- **Columna lateral:**
  - **"Clase seleccionada"**: actividad, fecha, horario y estado. Si está normal y no es pasada: formularios **Suspender** (motivo) y **Reprogramar** (nueva fecha, nueva hora, motivo). Si tiene un cambio y no es pasada: el detalle y **Restablecer**. Si es pasada: solo lectura.
  - **"Evento seleccionado"**: detalle y **Eliminar**.
  - **"Nuevo evento"** (siempre visible): título, fecha, hora, lugar, descripción y destinatarios (selector "Todo el club" o una actividad).
- La pestaña se agrega en el layout del admin, después de "Actividades".
- **Actividades:** el formulario de alta suma "Duración (min)" (60 por defecto) y la tabla muestra "18:00–19:00".

### Socio

- **Home:** card **"Próximos 7 días"** (`AgendaLista` de `calendarioSocio` desde hoy hasta hoy + 6) con el link **"Ver calendario"**.
- **`/c/[slug]/socio/calendario`:** `NavegacionMes` + calendario del mes en solo lectura.

### Admin general

Sin cambios.

## Tests

Infraestructura actual (Vitest `unit` + `integration`, Postgres real, `resetDb`, factories + `crearExcepcion`, `crearEvento`). Fechas con `hoy` explícito; los unitarios también pasan con `TZ=UTC`.

### Unitarios (`calendario/reglas.ts`)

| Función | Casos |
|---|---|
| `clasesEnRango` | miércoles de octubre de 2026 (4 fechas); rango que cruza el mes; nada antes de la creación; domingo (`diaSemana` 0) |
| `horaFin` | "18:00" + 60 → "19:00"; "23:30" + 60 → "00:30" |
| `armarCalendario` | clase normal con hora de fin; suspendida con motivo; reprogramada → `MOVIDA` + `REPROGRAMADA`; reprogramada con solo una fecha en el rango; actividad inactiva excluida; eventos incluidos; orden por fecha y hora |
| `semanasDelMes` | octubre 2026 (empieza jueves: arranca el lunes 28/9, 5 semanas); un mes de 6 semanas; febrero |

### Integración

| Área | Casos |
|---|---|
| `calendarioClub` | actividades activas y eventos del club; excluye otro club; trae la excepción cuya nueva fecha cae en el rango aunque la original no; rango mayor a 6 semanas rechazado |
| `calendarioSocio` | solo clases de sus actividades; eventos del club y de sus actividades, no de otras |
| `suspenderClase` | crea la excepción; fecha fuera de la regla; clase pasada; excepción existente; actividad de otro club o inactiva; motivo obligatorio |
| `reprogramarClase` | crea la excepción con fecha y hora nuevas; nueva fecha pasada; mismo horario |
| `restablecerClase` | borra la excepción; excepción de otro club; clase pasada |
| Eventos | crear para el club y para una actividad; actividad de otro club; fecha pasada; eliminar; eliminar de otro club |

### Seed

Relativo a hoy: una clase suspendida de Natación en los próximos días ("Feriado"), una clase reprogramada de Fútbol infantil, un evento para todo el club ("Asamblea anual") y uno solo para Natación ("Clínica de natación"). Lucía (inscripta en Natación) ve los casos que le corresponden en "Próximos 7 días".

## Flujo de demo (criterio de aceptación)

1. El admin abre Calendario y ve el mes con las clases recurrentes y los eventos del seed.
2. Suspende una clase de Yoga ("Lluvia") y reprograma una de Natación al día siguiente a las 20:00.
3. El socio inscripto en Natación ve el movimiento en "Próximos 7 días" (fecha original y nueva) y, en su calendario mensual, no ve Yoga.
4. El admin restablece la clase de Yoga y crea un evento para todo el club, que aparece en el calendario del socio.

## Fuera de alcance

Editar día u horario de una actividad; reservas por clase; asistencia; eventos con inscripción, cupo o costo; descuentos por clase suspendida; exportar a Google Calendar o iCal; notificaciones de los cambios (etapa 3).
