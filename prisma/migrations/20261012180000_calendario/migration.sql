-- CreateEnum
CREATE TYPE "TipoExcepcion" AS ENUM ('SUSPENDIDA', 'REPROGRAMADA');

-- AlterTable
ALTER TABLE "Actividad" ADD COLUMN     "duracionMin" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "ExcepcionClase" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoExcepcion" NOT NULL,
    "nuevaFecha" TIMESTAMP(3),
    "nuevaHora" TEXT,
    "motivo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExcepcionClase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evento" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "hora" TEXT NOT NULL,
    "lugar" TEXT,
    "actividadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExcepcionClase_clubId_fecha_idx" ON "ExcepcionClase"("clubId", "fecha");

-- CreateIndex
CREATE INDEX "ExcepcionClase_clubId_nuevaFecha_idx" ON "ExcepcionClase"("clubId", "nuevaFecha");

-- CreateIndex
CREATE UNIQUE INDEX "ExcepcionClase_actividadId_fecha_key" ON "ExcepcionClase"("actividadId", "fecha");

-- CreateIndex
CREATE INDEX "Evento_clubId_fecha_idx" ON "Evento"("clubId", "fecha");

-- AddForeignKey
ALTER TABLE "ExcepcionClase" ADD CONSTRAINT "ExcepcionClase_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcepcionClase" ADD CONSTRAINT "ExcepcionClase_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

