-- AlterEnum
ALTER TYPE "ConceptoCargo" ADD VALUE 'EVENTO';

-- AlterTable (fechaInicio se completa más abajo, antes de exigirla)
ALTER TABLE "Actividad" ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "fechaFin" TIMESTAMP(3),
ADD COLUMN     "fechaInicio" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Evento" ADD COLUMN     "conInscripcion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cupo" INTEGER,
ADD COLUMN     "duracionMin" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "precio" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "HorarioActividad" (
    "id" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "hora" TEXT NOT NULL,
    "duracionMin" INTEGER NOT NULL DEFAULT 60,

    CONSTRAINT "HorarioActividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InscripcionEvento" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InscripcionEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListaEspera" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "actividadId" TEXT,
    "eventoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListaEspera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HorarioActividad_actividadId_diaSemana_key" ON "HorarioActividad"("actividadId", "diaSemana");

-- CreateIndex
CREATE INDEX "InscripcionEvento_clubId_idx" ON "InscripcionEvento"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "InscripcionEvento_eventoId_socioId_key" ON "InscripcionEvento"("eventoId", "socioId");

-- CreateIndex
CREATE INDEX "ListaEspera_clubId_idx" ON "ListaEspera"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ListaEspera_socioId_actividadId_key" ON "ListaEspera"("socioId", "actividadId");

-- CreateIndex
CREATE UNIQUE INDEX "ListaEspera_socioId_eventoId_key" ON "ListaEspera"("socioId", "eventoId");

-- AddForeignKey
ALTER TABLE "HorarioActividad" ADD CONSTRAINT "HorarioActividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionEvento" ADD CONSTRAINT "InscripcionEvento_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionEvento" ADD CONSTRAINT "InscripcionEvento_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionEvento" ADD CONSTRAINT "InscripcionEvento_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Traspaso: cada actividad conserva su día, hora y duración como su único horario,
-- y sus clases empiezan el día (de Argentina, UTC-3) en que se creó.
INSERT INTO "HorarioActividad" ("id", "actividadId", "diaSemana", "hora", "duracionMin")
SELECT gen_random_uuid()::text, "id", "diaSemana", "hora", "duracionMin" FROM "Actividad";

UPDATE "Actividad" SET "fechaInicio" = date_trunc('day', "createdAt" - interval '3 hours');

ALTER TABLE "Actividad" ALTER COLUMN "fechaInicio" SET NOT NULL;

ALTER TABLE "Actividad" DROP COLUMN "diaSemana",
DROP COLUMN "duracionMin",
DROP COLUMN "hora";

-- Lista de espera: de una actividad o de un evento, nunca de los dos ni de ninguno.
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_un_destino" CHECK (("actividadId" IS NULL) <> ("eventoId" IS NULL));

