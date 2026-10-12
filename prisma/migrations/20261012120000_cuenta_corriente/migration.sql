-- CreateEnum
CREATE TYPE "ConceptoCargo" AS ENUM ('CUOTA', 'ACTIVIDAD');

-- CreateEnum
CREATE TYPE "EstadoCargo" AS ENUM ('PENDIENTE', 'PAGADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoIntento" AS ENUM ('APROBADO', 'RECHAZADO', 'PENDIENTE');

-- AlterEnum
ALTER TYPE "MedioPago" ADD VALUE 'ONLINE';

-- DropIndex
DROP INDEX "Pago_clubId_periodo_idx";

-- DropIndex
DROP INDEX "Pago_socioId_periodo_key";

-- AlterTable
ALTER TABLE "Actividad" ADD COLUMN     "arancel" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "diaVencimiento" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Pago" DROP COLUMN "periodo",
ADD COLUMN     "registradoPor" TEXT;

-- CreateTable
CREATE TABLE "Cargo" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "concepto" "ConceptoCargo" NOT NULL,
    "actividadId" TEXT,
    "clave" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "vencimiento" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoCargo" NOT NULL DEFAULT 'PENDIENTE',
    "pagoId" TEXT,
    "motivoAnulacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentoPago" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "cargoIds" TEXT[],
    "monto" INTEGER NOT NULL,
    "estado" "EstadoIntento" NOT NULL,
    "pasarela" TEXT NOT NULL,
    "referenciaExterna" TEXT,
    "motivoRechazo" TEXT,
    "ultimos4" TEXT,
    "pagoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentoPago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cargo_clubId_periodo_idx" ON "Cargo"("clubId", "periodo");

-- CreateIndex
CREATE INDEX "Cargo_clubId_estado_vencimiento_idx" ON "Cargo"("clubId", "estado", "vencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "Cargo_socioId_periodo_clave_key" ON "Cargo"("socioId", "periodo", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "IntentoPago_pagoId_key" ON "IntentoPago"("pagoId");

-- CreateIndex
CREATE INDEX "IntentoPago_clubId_estado_idx" ON "IntentoPago"("clubId", "estado");

-- CreateIndex
CREATE INDEX "Pago_clubId_fecha_idx" ON "Pago"("clubId", "fecha");

-- AddForeignKey
ALTER TABLE "Cargo" ADD CONSTRAINT "Cargo_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cargo" ADD CONSTRAINT "Cargo_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cargo" ADD CONSTRAINT "Cargo_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cargo" ADD CONSTRAINT "Cargo_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentoPago" ADD CONSTRAINT "IntentoPago_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentoPago" ADD CONSTRAINT "IntentoPago_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentoPago" ADD CONSTRAINT "IntentoPago_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

