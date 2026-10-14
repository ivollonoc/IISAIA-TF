# Evaluación del repo contra la consigna del TP final

_Fecha: 2026-10-14_

## Pregunta

> Evaluando el repo del trabajo final y la consigna del trabajo final, ¿qué faltaría?
> (La consigna se elaboró a partir del repo original del profe y las slides de cada semana:
> https://github.com/FIUBA-Posgrado-Inteligencia-Artificial/IISAIA/tree/main/semanas)

### Consigna

#### 1. Qué se entrega: la carpeta `tp-final/`

Producto: una aplicación que tenga interfaz, servidor y datos que persistan. El stack es libre: podés usar REST u otro estilo, vanilla o un framework, y guardar los datos en una base de datos o en archivos.

Qué va dentro de `tp-final/`:

- Un `README.md` que funcione como informe, con:
  - cómo se ejecuta,
  - la arquitectura,
  - las decisiones propias,
  - cómo gestionaron el contexto,
  - qué salió mal.
- Evidencia del proceso: la spec y el plan guardados en el repo, más los commits, branches y pull requests.
- La configuración del agente versionada: `.claude/` o el equivalente de tu herramienta.

Grupos de 2 o 3. La carpeta vive en el repo de uno de los integrantes y los demás entran como colaboradores.

#### 2. La configuración del agente también es producto

En `.claude/`, `.codex/` u `.opencode/`, cada pieza tiene que estar puesta con intención:

- Instrucciones del proyecto (`CLAUDE.md` o `AGENTS.md`) con el folder map y las convenciones.
- Instrucciones por tema, con scope por path si la herramienta lo permite.
- Configuración del runtime con permisos pensados para este proyecto.
- Al menos una skill propia.
- Un sub-agent, si la complejidad del proyecto lo justifica.
- Plan mode durante el desarrollo. No queda en un archivo: se ve en el proceso.

Todo esto se versiona junto con el código y se explica en la defensa.

#### 3. Cómo se evalúa: defensa en el Demo Day

La defensa es conjunta, sobre el repo terminado, y se evalúa al grupo. Se miran cuatro cosas:

- **Especificación:** cómo definieron qué construir antes de que el agente escribiera código.
- **Gestión del contexto:** qué guardaron y qué separaron para que el agente no perdiera el hilo entre sesiones.
- **Deriva:** dónde se desvió el agente, cómo lo detectaron y cómo lo corrigieron.
- **Evidencia:** el flujo visible en el repo (spec, plan, commits, branches, PRs) y la configuración del agente.

La slide define apropiación como poder explicar, corregir y extender lo que escribió el agente.

#### 4. Antes de implementar: exponer la idea

Cada grupo tiene 6 minutos para presentar cuatro puntos:

- **Problema:** qué resuelve la aplicación.
- **Usuarios:** para quién es.
- **MVP:** las funcionalidades mínimas sin las que la aplicación no sirve. Según las notas del orador, no es la lista de todo lo que les gustaría.
- **Stack:** con qué construyen la interfaz, el servidor y los datos.

La devolución es sobre alcance y viabilidad: si el proyecto llega a terminarse para el Demo Day y qué conviene recortar antes de empezar.

---

## Respuesta

Revisé el repo contra la consigna. Lo que más pesa en la defensa (spec, gestión de contexto, deriva y evidencia) es justo lo que está más flojo. La app está bien resuelta. No pude ver PRs desde acá porque `gh` no está instalado, así que eso conviene confirmarlo en GitHub.

### Lo que ya está cubierto

- **Producto:** Next.js + Prisma/Postgres con interfaz, servidor y datos persistentes, tests unitarios y de integración, CI y deploy en Vercel + Neon.
- **Spec y plan versionados:** están en `docs/superpowers/specs/` y `docs/superpowers/plans/`.
- **Branches y commits:** hay ramas `mvp1` a `mvp4` y commits de los dos integrantes (Pablo e Ignacio).
- **Exposición de la idea:** `docs/propuesta.md` y la presentación en pptx.
- **README:** explica cómo se ejecuta, el stack, la estructura, la API, los tests y el deploy.

### Lo que falta

#### 1. Configuración del agente (lo más grave: hoy no hay nada versionado)

`.claude/` está sin trackear y solo tiene `launch.json` y `settings.local.json`. Ese segundo archivo es personal y no debería versionarse. Faltan:

- **`CLAUDE.md`** en la raíz, con el mapa de carpetas (`src/modules/*`, `src/lib`, `prisma/`, `tests/`, `docs/superpowers/`) y las convenciones: nombres en español, módulos con `service`/`actions`/`schema`, multitenancy por `slug`, migraciones con Prisma, no tocar `.env`.
- **Instrucciones por tema con alcance por ruta:** archivos en `.claude/rules/*.md` con `paths:` en el encabezado. Por ejemplo, una para `prisma/**` (migraciones nuevas, nunca editar las existentes, actualizar el seed), otra para `tests/**` (factories y helpers de base de datos) y otra para `src/modules/**` (aislamiento por tenant).
- **`.claude/settings.json`** versionado, con permisos pensados para este proyecto: permitir `npm test`, `npx prisma migrate dev` y `git`; prohibir leer `.env` y `prisma migrate reset` contra Neon. También se puede declarar el plugin superpowers en `enabledPlugins`, que es el que generó las specs y los planes.
- **Al menos una skill propia** en `.claude/skills/<nombre>/SKILL.md`. Algunas candidatas: `nueva-etapa` (spec, plan, rama, implementación, revisión), `nueva-migracion` o `regenerar-demo` (el seed con `SEED_SOLO_DEMO`).
- **Un sub-agent** en `.claude/agents/`, que se justifica por la complejidad. El más defendible es un revisor de multitenancy y permisos, ya que en la etapa 8 apareció un problema con `x-forwarded-host`.

#### 2. El README como informe

Le faltan cuatro de las cinco secciones que pide la consigna:

- **Arquitectura:** hoy solo hay una lista de carpetas. Falta explicar el flujo: middleware → tenant → módulos → Prisma, y cómo funcionan los pagos y avisos simulados.
- **Decisiones propias:** por ejemplo, el ingreso con link mágico en lugar de Google, la reserva por clase en lugar de la inscripción mensual, el subdominio controlado con `TENANT_MODE` y los grupos familiares.
- **Cómo gestionaron el contexto:** `CLAUDE.md`, `docs/contexto/`, las specs y los planes por etapa, la memoria del agente y las sesiones por etapa.
- **Qué salió mal y la deriva:** el historial ya tiene material. Por ejemplo, el commit "Revisión de la etapa 8: x-forwarded-host acotado" (un desvío de seguridad detectado en la revisión), el cambio de la inscripción mensual a la reserva por clase y los ajustes al seed para que la demo funcione cualquier día.
- **Integrantes del grupo.**

#### 3. Evidencia del flujo en git

- **PRs:** no hay ningún commit de merge. Las ramas `mvp*` parecen haberse integrado por fast-forward o con push directo a `main`, así que probablemente no exista ningún PR. Lo que queda por delante debería pasar por rama + PR con descripción y revisión.
- **Ramas sin integrar:** `mvp3` tenía un commit que no estaba en `main` ("Seed: modo SEED_SOLO_DEMO…"). _Actualización: ese commit se eliminó; nunca se había subido, así que la rama local quedó igual a `origin/mvp3`._
- **Sin commitear:** `docs/contexto/`, que es evidencia directa de la gestión del contexto, y la presentación modificada.
- **Specs y planes incompletos:** hay plan de las etapas 0 a 5 y 8, pero no hay spec ni plan propios para puntajes y reportes, importación por CSV ni el subdominio inicial. Hay dos caminos: cubrirlos con una spec o plan breve, o contar en el informe que se hicieron sin plan y por qué.

#### 4. La carpeta `tp-final/`

La consigna pide que todo esté dentro de `tp-final/`, y hoy el proyecto está en la raíz del repo. Mover una app Next con CI, Vercel y Docker tiene su costo. Antes de hacerlo, consultaría con el profe si alcanza con que el repo entero sea el TP.

#### 5. Plan mode

No queda en un archivo, pero conviene poder mostrarlo. Se puede mencionar en el informe en qué etapas se usó y guardar alguna captura o fragmento de sesión.

### Orden que sugiero

1. Commitear `docs/contexto/`.
2. Armar `CLAUDE.md`, `settings.json`, las rules, una skill y el sub-agent, todo en una rama nueva con su PR.
3. Reescribir el README como informe en otra rama, también con PR.
4. Consultar con el profe lo de `tp-final/`.
