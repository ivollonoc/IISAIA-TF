-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "demo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TokenAcceso" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "expira" TIMESTAMP(3) NOT NULL,
    "usadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenAcceso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenAcceso_hash_key" ON "TokenAcceso"("hash");

-- CreateIndex
CREATE INDEX "TokenAcceso_usuarioId_idx" ON "TokenAcceso"("usuarioId");

-- AddForeignKey
ALTER TABLE "TokenAcceso" ADD CONSTRAINT "TokenAcceso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Los usuarios demo del seed siguen entrando sin contraseña (el resto, con link mágico).
UPDATE "Usuario" SET "demo" = true
WHERE "email" IN ('admin@gestiondesocios.com', 'admin@demo.club', 'socio@demo.club');
