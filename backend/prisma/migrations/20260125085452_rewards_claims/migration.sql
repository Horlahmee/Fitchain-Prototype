-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "claimId" TEXT,
ADD COLUMN     "claimTx" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ALTER COLUMN "genuineScore" SET DEFAULT 80;

-- CreateTable
CREATE TABLE "RewardClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "amountFit" DECIMAL(18,6) NOT NULL,
    "status" TEXT NOT NULL,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "RewardClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RewardClaim_userId_dayKey_idx" ON "RewardClaim"("userId", "dayKey");

-- AddForeignKey
ALTER TABLE "RewardClaim" ADD CONSTRAINT "RewardClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
