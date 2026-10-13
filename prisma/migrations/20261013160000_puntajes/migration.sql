-- AlterTable
ALTER TABLE "Socio" ADD COLUMN     "bajaAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Puntaje" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "medias" INTEGER NOT NULL,
    "comentario" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Puntaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Puntaje_clubId_idx" ON "Puntaje"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "Puntaje_actividadId_socioId_key" ON "Puntaje"("actividadId", "socioId");

-- AddForeignKey
ALTER TABLE "Puntaje" ADD CONSTRAINT "Puntaje_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Puntaje" ADD CONSTRAINT "Puntaje_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Puntaje" ADD CONSTRAINT "Puntaje_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Los socios ya dados de baja toman como fecha de baja su alta (no se registraba).
UPDATE "Socio" SET "bajaAt" = "createdAt" WHERE NOT "activo";
