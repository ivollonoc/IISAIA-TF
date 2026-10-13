-- CreateTable
CREATE TABLE "AvisoEnviado" (
    "id" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "clubId" TEXT,
    "autorId" TEXT,
    "asunto" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "para" TEXT NOT NULL,
    "destinatarios" INTEGER NOT NULL,
    "canales" "CanalAviso"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvisoEnviado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvisoEnviado_origen_clubId_createdAt_idx" ON "AvisoEnviado"("origen", "clubId", "createdAt");

-- AddForeignKey
ALTER TABLE "AvisoEnviado" ADD CONSTRAINT "AvisoEnviado_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvisoEnviado" ADD CONSTRAINT "AvisoEnviado_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

