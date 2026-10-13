-- Grupo familiar (titular + familiares) y pagos grupales: un intento online puede generar varios
-- pagos (uno por socio), así que el vínculo pasa de IntentoPago.pagoId a Pago.intentoId.

-- AlterTable
ALTER TABLE "Socio" ADD COLUMN     "titularId" TEXT;

-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "intentoId" TEXT,
ADD COLUMN     "pagadorId" TEXT;

-- Traspaso: cada pago queda apuntando al intento que lo generó.
UPDATE "Pago" p SET "intentoId" = i."id" FROM "IntentoPago" i WHERE i."pagoId" = p."id";

-- DropForeignKey
ALTER TABLE "IntentoPago" DROP CONSTRAINT "IntentoPago_pagoId_fkey";

-- DropIndex
DROP INDEX "IntentoPago_pagoId_key";

-- AlterTable
ALTER TABLE "IntentoPago" DROP COLUMN "pagoId";

-- AddForeignKey
ALTER TABLE "Socio" ADD CONSTRAINT "Socio_titularId_fkey" FOREIGN KEY ("titularId") REFERENCES "Socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_pagadorId_fkey" FOREIGN KEY ("pagadorId") REFERENCES "Socio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_intentoId_fkey" FOREIGN KEY ("intentoId") REFERENCES "IntentoPago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Socio_titularId_idx" ON "Socio"("titularId");
