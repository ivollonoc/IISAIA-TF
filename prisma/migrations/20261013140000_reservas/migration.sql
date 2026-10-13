-- Reserva por clase: la inscripción mensual a una actividad se reemplaza por reservas de clases
-- concretas, con cupo, lista de espera y precio por clase.

-- Cargos: el arancel mensual de actividad pasa a ser el cargo de una clase.
BEGIN;
CREATE TYPE "ConceptoCargo_new" AS ENUM ('CUOTA', 'CLASE', 'EVENTO');
ALTER TABLE "Cargo" ALTER COLUMN "concepto" TYPE "ConceptoCargo_new"
  USING (CASE WHEN "concepto"::text = 'ACTIVIDAD' THEN 'CLASE' ELSE "concepto"::text END)::"ConceptoCargo_new";
ALTER TYPE "ConceptoCargo" RENAME TO "ConceptoCargo_old";
ALTER TYPE "ConceptoCargo_new" RENAME TO "ConceptoCargo";
DROP TYPE "ConceptoCargo_old";
COMMIT;

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "hora" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- Traspaso: cada inscripción vigente pasa a reservas de las clases de los próximos 28 días
-- (días del calendario de Argentina, dentro de la vigencia de la actividad).
INSERT INTO "Reserva" ("id", "clubId", "actividadId", "socioId", "fecha", "hora")
SELECT gen_random_uuid()::text, i."clubId", i."actividadId", i."socioId", d::timestamp, h."hora"
FROM "Inscripcion" i
JOIN "Actividad" a ON a."id" = i."actividadId" AND a."activa"
JOIN "HorarioActividad" h ON h."actividadId" = i."actividadId"
CROSS JOIN generate_series(
  (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 27,
  interval '1 day'
) AS d
WHERE EXTRACT(DOW FROM d) = h."diaSemana"
  AND d::timestamp >= a."fechaInicio"
  AND (a."fechaFin" IS NULL OR d::timestamp <= a."fechaFin");

-- Precio por clase: el arancel mensual repartido en las clases de un mes (horarios × 4).
ALTER TABLE "Actividad" ADD COLUMN     "precioClase" INTEGER NOT NULL DEFAULT 0;
UPDATE "Actividad" a SET "precioClase" = ROUND(a."arancel"::numeric / (4 * GREATEST(1, (
  SELECT COUNT(*) FROM "HorarioActividad" h WHERE h."actividadId" = a."id"
))));
ALTER TABLE "Actividad" DROP COLUMN "arancel";

-- Lista de espera: pasa a ser por clase; las de actividad (sin clase) se descartan.
DROP INDEX "ListaEspera_socioId_actividadId_key";
ALTER TABLE "ListaEspera" ADD COLUMN     "fecha" TIMESTAMP(3),
ADD COLUMN     "hora" TEXT;
DELETE FROM "ListaEspera" WHERE "actividadId" IS NOT NULL;

-- DropTable
ALTER TABLE "Inscripcion" DROP CONSTRAINT "Inscripcion_clubId_fkey";
ALTER TABLE "Inscripcion" DROP CONSTRAINT "Inscripcion_actividadId_fkey";
ALTER TABLE "Inscripcion" DROP CONSTRAINT "Inscripcion_socioId_fkey";
DROP TABLE "Inscripcion";

-- CreateIndex
CREATE INDEX "Reserva_clubId_fecha_idx" ON "Reserva"("clubId", "fecha");

-- CreateIndex
CREATE INDEX "Reserva_socioId_fecha_idx" ON "Reserva"("socioId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Reserva_actividadId_fecha_hora_socioId_key" ON "Reserva"("actividadId", "fecha", "hora", "socioId");

-- CreateIndex
CREATE UNIQUE INDEX "ListaEspera_socioId_actividadId_fecha_hora_key" ON "ListaEspera"("socioId", "actividadId", "fecha", "hora");

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La lista de espera de una actividad siempre indica la clase.
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_clase_completa"
  CHECK ("actividadId" IS NULL OR ("fecha" IS NOT NULL AND "hora" IS NOT NULL));
