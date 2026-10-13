# Reserva por clase: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** reemplazar la inscripción mensual por reservas de clases concretas (cupo por clase, lista de espera por clase, precio por clase).

**Spec:** [ajustes, familia y reservas — bloque C](../specs/2026-10-13-ajustes-familia-reservas-design.md#c--reserva-por-clase)

## Global Constraints

- Una clase es (actividadId, fecha, hora original). Una clase reprogramada se reserva por su clave original.
- "Participantes" de una actividad (para eventos y avisos de la actividad): socios con alguna reserva en ella desde hace 30 días en adelante.
- Toda consulta filtra por `clubId`; servicios reciben `hoy` (instante).

## Review Focus

1. Reservar la última plaza en simultáneo → entra una sola (Task 2).
2. Reservar una clase suspendida, pasada o fuera de vigencia → rechazo claro (Task 2).
3. Cancelar una reserva de una clase llena → aviso a la lista de espera de esa clase, no de otras (Task 2).
4. Editar horarios con reservas futuras que quedan huérfanas → se borran y se anulan sus cargos (Task 3).
5. Migración con inscripciones existentes → reservas de las próximas 4 semanas (Task 1).

---

### Task 1: Modelo y migración `reservas`
- `Reserva` (único actividad+fecha+hora+socio), `Actividad.precioClase` (sale `arancel`), sale `Inscripcion`, `ListaEspera.fecha/hora` (único socio+actividad+fecha+hora), `ConceptoCargo.ACTIVIDAD` → `CLASE`.
- Traspaso SQL: inscripciones → reservas de las clases de los próximos 28 días; `precioClase = round(arancel / (horarios × 4))`; listas de espera de actividad sin clase se descartan.
- Factories: `reservarDirecto(clubId, actividadId, socioId, { fecha, hora })`, `crearActividad({ precioClase })`, `anotarEsperaDirecto(…, { actividadId, fecha, hora })`.

### Task 2: Servicio de reservas (`src/modules/reservas/service.ts`)
- `reservar`, `reservarSerie({ actividadId, diaSemana, hora, semanas })`, `cancelarReserva`, `clasesParaSocio(clubId, socioId, hoy, dias = 14)`, `reservasDeClase`.
- Lista de espera por clase en `lista-espera.service.ts` (`{ actividadId, fecha, hora }`).
- Cargo `CLASE` por reserva paga (clave `CLA:<actividadId>:<fecha>:<hora>`, vence el día de la clase); cancelar anula el pendiente; reservar de nuevo lo reactiva.
- Tests: cupo por clase, concurrencia, clase inexistente/suspendida/pasada/fuera de vigencia, reprogramada, serie (reserva las que tienen lugar), cancelar (hasta el inicio), lista de espera y aviso por clase, cargos.

### Task 3: Adaptar el resto
- Cargos del período: solo cuota social. Calendario del socio: sus clases reservadas. Eventos de una actividad y avisos por actividad: participantes. Avisos de clase: reservas de esa clase. Suspender: anula cargos de esa clase. Editar actividad: cupo ≥ reservas de cualquier clase futura; reservas huérfanas borradas (y cargos anulados); subir cupo avisa a las listas de espera de las clases que tenían lugar. Se eliminan `inscribir`, `cancelarInscripcion`, `actividadesParaSocio`, la ruta API de inscripción.

### Task 4: Pantallas, seed y README
- Socio: "Actividades y eventos" con próximas clases de cada actividad (2 semanas) y "Reservar las de este horario por N semanas". Home: próximos 7 días con sus reservas.
- Admin: Agenda con reservas/cupo en cada clase y lista de quién reservó; formulario con precio por clase.
- Seed: reservas de Lucía (Natación), Martín y Valentina llenando Yoga del próximo martes con Lucía en espera. README.
