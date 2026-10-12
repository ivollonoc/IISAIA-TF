-- CreateEnum
CREATE TYPE "CanalAviso" AS ENUM ('IN_APP', 'EMAIL', 'SMS');

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "canales" "CanalAviso"[] DEFAULT ARRAY['IN_APP']::"CanalAviso"[];

-- AlterTable
ALTER TABLE "Socio" ADD COLUMN     "telefono" TEXT;

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "clubId" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "link" TEXT,
    "leidaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensajeSaliente" (
    "id" TEXT NOT NULL,
    "clubId" TEXT,
    "canal" "CanalAviso" NOT NULL,
    "destino" TEXT NOT NULL,
    "asunto" TEXT,
    "cuerpo" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensajeSaliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notificacion_usuarioId_leidaAt_idx" ON "Notificacion"("usuarioId", "leidaAt");

-- CreateIndex
CREATE INDEX "MensajeSaliente_clubId_createdAt_idx" ON "MensajeSaliente"("clubId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajeSaliente" ADD CONSTRAINT "MensajeSaliente_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

