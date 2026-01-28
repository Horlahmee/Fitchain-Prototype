-- CreateEnum
CREATE TYPE "InAppWalletTxType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateTable
CREATE TABLE "InAppWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balanceFit" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InAppWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InAppWalletTx" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "InAppWalletTxType" NOT NULL,
    "amountFit" DECIMAL(18,6) NOT NULL,
    "memo" TEXT,
    "ref" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InAppWalletTx_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InAppWallet_userId_key" ON "InAppWallet"("userId");

-- CreateIndex
CREATE INDEX "InAppWalletTx_walletId_createdAt_idx" ON "InAppWalletTx"("walletId", "createdAt");

-- AddForeignKey
ALTER TABLE "InAppWallet" ADD CONSTRAINT "InAppWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InAppWalletTx" ADD CONSTRAINT "InAppWalletTx_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "InAppWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
