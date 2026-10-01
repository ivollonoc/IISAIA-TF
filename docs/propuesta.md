# Propuesta v1 — Gestión de Socios

## Problema / objetivo

Los clubes deportivos chicos y medianos gestionan socios, cuotas e inscripciones con planillas y mensajes. No tienen una vista clara de quién está al día ni del cupo de cada actividad, y el socio no puede consultar su propio estado.

**Objetivo:** una app web donde cada club administra su padrón, cobros y actividades, y cada socio se autogestiona.

## Usuarios

- **Admin general** (equipo de la plataforma): da de alta clubes y sus administradores.
- **Admin de club**: gestiona socios, tipos de socio, cobros y actividades.
- **Socio**: consulta su cuota y pagos, y se inscribe a actividades.

## MVP (v1)

| Rol | Funcionalidad |
|---|---|
| Admin general | Crear club (nombre + slug) y asignarle un admin por email |
| Admin de club | Tipos de socio con cuota · alta, modificación y baja lógica de socios · registro manual de pagos · actividades con día, hora y cupo · resumen del mes |
| Socio | Login · estado de cuota e historial de pagos · inscribirse / cancelar actividades respetando cupo |

**Fuera de v1 (roadmap):** pago online (Mercado Pago), subdominio por club, calendario de eventos puntuales, notificaciones, reportes.

### Decisiones de alcance

1. **Multi-tenant por ruta** (`/c/[slug]`) en lugar de subdominio: la base ya es multi-tenant; pasar a `slug.gestiondesocios.com` es solo cambiar el ruteo.
2. **Cobros manuales**: el modelo `Pago` queda listo para conectar una pasarela en v2.

## Stack

| Capa | Elección | Motivo |
|---|---|---|
| Interfaz | Next.js 15 + React + TypeScript + Tailwind | Stack propuesto; SSR y Server Actions |
| Servidor | Route Handlers y Server Actions de Next.js (Node) | Un solo proyecto y un deploy; expone API REST |
| Auth | NextAuth con Google, sesión JWT | Rol y club como claims del token |
| Datos | PostgreSQL + Prisma | Dominio relacional; transacciones para cupos |
| Tests | Vitest | Validación, permisos y reglas de cuota |
| Infra | Docker Compose / Codespaces · Vercel + Neon | Ejecución local y deploy gratuito |

**¿Por qué relacional?** club → socios → pagos y actividad ↔ inscripciones con cupo requieren integridad referencial y transacciones. El aislamiento multi-tenant se resuelve con `clubId` en cada tabla.

## Modelo de datos

```
Club(id, nombre, slug)
Usuario(id, email, rol, clubId?)
TipoSocio(id, clubId, nombre, cuotaMensual)
Socio(id, clubId, usuarioId?, nroSocio, nombre, apellido, dni, email?, tipoSocioId, activo)
Pago(id, clubId, socioId, periodo "YYYY-MM", monto, medio, fecha)      UNIQUE(socioId, periodo)
Actividad(id, clubId, nombre, diaSemana, hora, cupo, activa)
Inscripcion(id, clubId, actividadId, socioId)                         UNIQUE(actividadId, socioId)
```

Un socio está **al día** si tiene un pago del período actual (se calcula, no se guarda).

## Verificación

- Tests unitarios de validación, permisos multi-tenant y cálculo de cuota.
- CI (GitHub Actions): typecheck + tests + build contra Postgres.
- Flujo manual de demo: admin general crea club → admin de club carga tipo, socio y pago → socio se inscribe a una actividad hasta agotar cupo.
