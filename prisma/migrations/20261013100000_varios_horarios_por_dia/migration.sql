-- Varios horarios por día: la clase pasa a identificarse por (actividad, fecha, hora).

-- DropIndex
DROP INDEX "HorarioActividad_actividadId_diaSemana_key";

-- DropIndex
DROP INDEX "ExcepcionClase_actividadId_fecha_key";

-- AlterTable (la hora se completa más abajo, antes de exigirla)
ALTER TABLE "ExcepcionClase" ADD COLUMN     "hora" TEXT;

-- Traspaso: hasta ahora había un solo horario por día, así que la hora de cada excepción es la
-- del horario de la actividad para ese día de la semana. Las que no tienen horario (no deberían
-- existir) se descartan porque ya no corresponden a ninguna clase.
UPDATE "ExcepcionClase" e SET "hora" = h."hora"
FROM "HorarioActividad" h
WHERE h."actividadId" = e."actividadId" AND h."diaSemana" = EXTRACT(DOW FROM e."fecha");

DELETE FROM "ExcepcionClase" WHERE "hora" IS NULL;

ALTER TABLE "ExcepcionClase" ALTER COLUMN "hora" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "HorarioActividad_actividadId_diaSemana_hora_key" ON "HorarioActividad"("actividadId", "diaSemana", "hora");

-- CreateIndex
CREATE UNIQUE INDEX "ExcepcionClase_actividadId_fecha_hora_key" ON "ExcepcionClase"("actividadId", "fecha", "hora");
