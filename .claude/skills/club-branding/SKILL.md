---
name: club-branding
description: Tematiza un club de la app a partir de su logo o escudo. Extrae los colores del logo, decide primario y secundario, genera la escala 50–950 con contraste AA, muestra una lámina para aprobar y guarda logo y tema en el club. Usala cuando el usuario pase un logo/escudo/imagen de un club y quiera "los colores del club", "tematizar", "personalizar el diseño" o "aplicar la identidad visual" de un club.
---

# club-branding: del logo al tema del club

La app ya soporta un tema por club: `Club.logoUrl` + `Club.tema` (JSON validado por `src/lib/tema.ts`).
Las clases `bg-primario`, `text-primario-700`, `border-secundario`, etc. leen variables `--club-*`
que el layout completa con el tema del club. Esta skill produce ese tema a partir de un logo.

Los scripts necesitan las dependencias instaladas (`npm install`, incluye `sharp`). Se corren desde la raíz del repo.

## Pasos

1. **Datos de entrada.** Necesitás la ruta del logo (svg, png, jpg o webp) y el `slug` del club. Si falta el slug, preguntalo.
   Trabajá los archivos intermedios en el scratchpad, no en el repo.

2. **Extraer colores.**
   ```bash
   npx tsx .claude/skills/club-branding/scripts/paleta.ts extraer <logo>
   ```
   Devuelve los colores dominantes con porcentaje, `tipo` (color/blanco/negro/gris) y `fondoProbable`.

3. **Mirar el logo y decidir roles.** Abrí la imagen con Read. El script solo cuenta píxeles: vos decidís.
   - Descartá el fondo (`fondoProbable`) y los contornos negros o grises finos, salvo que el negro sea un color del club.
   - **Primario**: el color que identifica al club (el de la camiseta), no necesariamente el de más píxeles.
   - **Secundario** (opcional): el segundo color institucional. Se usa en la franja del header.
   - Si es un club conocido y los colores extraídos no coinciden con los institucionales, avisá en lugar de inventar.

4. **Generar el tema y la lámina.**
   ```bash
   npx tsx .claude/skills/club-branding/scripts/paleta.ts tema --primario #rrggbb --secundario #rrggbb \
     --logo <logo> --salida <scratchpad>/tema.json --preview <scratchpad>/tema.html
   ```
   - Arma la escala en OKLCH con el tono del primario, elige texto blanco u oscuro y valida con la misma regla que la app.
   - Si el primario no llega a contraste AA con ningún texto, el script falla. Proponé `--ajustar` (oscurece el mismo tono)
     o elegí otro color, y explicale al usuario el trade-off.

5. **Mostrar y pedir aprobación.** Abrí `tema.html` en el browser pane (o publicalo) y resumí: primario, secundario,
   texto elegido y ratios de contraste. No apliques nada sin un "sí" del usuario.

6. **Aplicar.**
   ```bash
   DATABASE_URL=<url de la base local> npx tsx .claude/skills/club-branding/scripts/aplicar.ts <slug> <scratchpad>/tema.json <logo>
   ```
   No uses `--env-file=.env`: en este repo el `.env` apunta a Neon de producción.
   Copia el logo a `public/clubs/<slug>.<ext>` y actualiza el club en la base.
   - Si `DATABASE_URL` no es local (por ejemplo Neon), el script se niega. Confirmá explícitamente con el usuario
     antes de repetir con `--produccion`.
   - Para que el tema sobreviva a `npm run db:seed`, si el club está en `prisma/seed.ts`, agregá ahí `logoUrl` y `tema`.

7. **Verificar.** Con `npm run dev`, entrá como admin o socio del club y revisá header, botones y links.
   El logo en `public/clubs/` se commitea junto con el cambio del seed.

## Notas

- Colores semánticos (verde "al día", ámbar "debe", rojo "error") no se tematizan: no los cambies por el primario.
- Para cambiar la regla de legibilidad, se edita `temaSchema` en `src/lib/tema.ts`; los scripts la importan de ahí.
