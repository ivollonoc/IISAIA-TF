# Ajustes de privacidad, grupos familiares y reserva por clase

Fecha: 2026-10-13 · Estado: aprobado (respuestas del 13/10) · Ajusta: [roadmap-v3](2026-10-12-roadmap-v3-design.md) · Rama: `mvp3`

Tres bloques, en este orden: **A** ajustes (admin general, buzones, fechas con hora, seed), **B** grupos familiares, **C** reserva por clase. Después siguen login, reportes y subdominio (roadmap v3, etapas 5, 7 y 8).

## Decisiones

| # | Tema | Decisión |
|---|---|---|
| 1 | Admin general | Pestañas **Clubes** y **Avisos**. Sin información financiera de los clubes: se eliminan el consolidado, las columnas de cobrado/deuda y la página "Ver cuenta" del club. |
| 2 | Buzones | Nadie ve mensajes individuales de otros. El admin del club ve el **historial de sus avisos manuales**; el admin general, el de los suyos. Los mails/SMS siguen registrándose (`MensajeSaliente`) pero no se muestran. |
| 3 | Fechas | Movimientos y pagos muestran fecha **y hora** (`dd/mm/aaaa hh:mm`, hora de Argentina). |
| 4 | Seed | Pagos y cargos con fechas realistas en el pasado (no "ahora"). |
| 5 | Grupo familiar | Un nivel (titular + familiares, mismo club). **Solo el titular paga**: tiene la pestaña **Pagos** con los cargos de todo el grupo. Los familiares ven su cuenta sin botones de pago. |
| 6 | Pago grupal | Un `Pago` **por socio** dueño de los cargos (la cuenta de cada uno cierra), con `pagadorId` = titular. Un intento online puede generar varios pagos. |
| 7 | Reservas | **Reserva por clase**: cupo por clase; el socio reserva clases sueltas o todas las de un horario por N semanas; lista de espera por clase; precio por clase opcional (cada reserva genera un cargo). Desaparece la inscripción mensual. |
| 8 | Reportes (etapa 7) | El reporte global no incluye dinero de los clubes (coherente con 1). |

---

## A — Ajustes

### Admin general (`/admin`)

- Pestañas: **Clubes** (`/admin`) y **Avisos** (`/admin/avisos`).
- Clubes: tabla (club, URL, slug, socios activos, administrador) + formulario de alta.
- Se eliminan `resumenPlataforma`, la página `/admin/clubs/[slug]/cuenta` y su test.

### Historial de avisos

```prisma
model AvisoEnviado {
  id            String       @id @default(cuid())
  origen        String       // "CLUB" | "PLATAFORMA"
  clubId        String?      // club que lo envía (null si es de la plataforma); onDelete: Cascade
  autorId       String?      // usuario que lo envió; onDelete: SetNull
  asunto        String
  mensaje       String
  para          String       // "Todos los socios", "Inscriptos de Yoga", "Todos los clubes", "Club Atlas"
  destinatarios Int
  canales       CanalAviso[]
  createdAt     DateTime     @default(now())
}
```

- `enviarAvisoClub` y `enviarAvisoPlataforma` lo registran. `historialAvisos("CLUB", clubId)` / `historialAvisos("PLATAFORMA")`.
- Se eliminan `buzonSalida` y el componente `BuzonSalida`.

### Fechas con hora

- `formatFechaHora(fecha)` → `"12/10/2026 20:15"` en `America/Argentina/Buenos_Aires`.
- Se usa en la cuenta corriente (socio, ficha del socio y cuenta del club) y en el historial de avisos.

### Seed

- Cargos creados el día 1 de su período a las 9:00 (o el día anterior a hoy si el período todavía no empezó).
- Pagos del período vencido: unos días antes de su vencimiento, en horario de atención; pagos del período por vencer: hace 1 a 3 días.

---

## B — Grupos familiares

### Modelo

```prisma
model Socio {
  titularId  String?          // mismo club; onDelete: SetNull
  titular    Socio?  @relation("GrupoFamiliar", ...)
  familiares Socio[] @relation("GrupoFamiliar")
}
model Pago {
  pagadorId  String?          // socio que pagó (titular de un grupo); null = el propio socio
  intentoId  String?          // intento online que lo generó (reemplaza IntentoPago.pagoId)
}
```

Migración: `Pago.intentoId` se completa desde `IntentoPago.pagoId`, que se elimina.

### Reglas

- `agregarAlGrupo(clubId, titularId, socioId)`: mismo club; el titular no es familiar de nadie; el socio no es titular de otro grupo ni ya está en un grupo; no es el mismo. Errores: "Socio no encontrado", "El titular ya es familiar de otro socio", "Ese socio ya está en un grupo familiar", "Ese socio es titular de otro grupo", "Un socio no puede ser su propio familiar".
- `quitarDelGrupo(clubId, socioId)`. Un titular sin familiares deja de ser grupo.
- `resumenGrupos(clubId)`: `{ grupos, sociosEnGrupos, tamanioMedio }` (tamaño = titular + familiares; medio con un decimal) y la lista de grupos.
- **Pago:** `registrarPago` y `pagarOnline` aceptan cargos del titular y de sus familiares cuando paga el titular (`pagadorId`); crean un `Pago` por socio dueño de cargos. Un familiar no puede pagar (`DomainError("Los pagos de tu grupo los hace el titular")`). En ventanilla el admin sigue pagando por socio.
- Avisos: "Pago acreditado" al titular (con el total).

### Pantallas

- Admin del club: pestaña **Grupos familiares**: indicadores, lista de grupos (titular, integrantes, quitar) y "Armar grupo" (titular + agregar integrante).
- Socio titular: pestaña **Pagos** con los pendientes del grupo (columna Socio), selección y pago online. Su "Mi cuenta" sigue mostrando su cuenta.
- Socio familiar: en "Mi cuenta", "Los pagos los hace tu titular, X" en lugar del botón Pagar.

---

## C — Reserva por clase

### Modelo

```prisma
model Actividad {
  // sale: arancel (mensual); entra:
  precioClase Int @default(0)   // pesos por clase; 0 = gratis
}
// sale: Inscripcion
model Reserva {
  id          String   @id @default(cuid())
  clubId      String
  actividadId String   // onDelete: Cascade
  socioId     String   // onDelete: Cascade
  fecha       DateTime // día de la clase (medianoche UTC)
  hora        String   // hora de la clase
  createdAt   DateTime @default(now())
  @@unique([actividadId, fecha, hora, socioId])
  @@index([clubId, fecha])
}
model ListaEspera { fecha DateTime?  hora String? }  // de una clase (actividad) o de un evento
enum ConceptoCargo { CUOTA CLASE EVENTO }             // ACTIVIDAD → CLASE
```

Migración: las inscripciones mensuales se convierten en reservas de las clases futuras de las próximas 4 semanas; `arancel` mensual → `precioClase` = arancel / clases del mes (redondeado); cargos `ACTIVIDAD` existentes se conservan con concepto `CLASE`.

### Reglas

- Cupo por clase: reservas de esa clase < `cupo`. La clase debe existir (horario, vigencia, no suspendida; si está reprogramada, se reserva la clase original y vale para su nueva fecha).
- `reservar(clubId, socioId, { actividadId, fecha, hora })` (serializable). `reservarSerie(clubId, socioId, { actividadId, diaSemana, hora, semanas: 1..12 })` → reserva las que tengan lugar y devuelve `{ reservadas, completas }`.
- `cancelarReserva`: hasta el inicio de la clase. Si estaba completa → "Se liberó un lugar" a la lista de espera de **esa clase**.
- Precio por clase > 0 → cargo `CLASE` (período de la clase, vence el día de la clase). Cancelar anula el pendiente.
- La generación mensual de cargos deja de crear aranceles de actividad (solo cuota social).
- Avisos de clases (suspendida, reprogramada, restablecida) → socios con reserva en **esa** clase. Cambio de horarios → socios con reservas futuras en la actividad. Eventos de una actividad → socios con reservas futuras en ella.
- Suspender una clase con reservas: se mantienen (el socio ve "suspendida"); el cargo pendiente se anula ("Clase suspendida").

### Pantallas

- Socio, Actividades y eventos: por actividad, sus próximas clases (2 semanas) con lugares, Reservar / Cancelar / Avisarme; "Reservar todas las de este horario por N semanas".
- Socio, Calendario: sus clases reservadas y eventos.
- Admin, Agenda: en cada clase, reservas/cupo y lista de quiénes reservaron.
