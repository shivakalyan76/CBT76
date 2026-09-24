-- AlterTable
ALTER TABLE "Answer" ADD COLUMN "isCorrect" BOOLEAN,
ADD COLUMN "marksObtained" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN "isPassed" BOOLEAN;

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN "cameraRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ExamAssignment" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "department" TEXT,
ADD COLUMN "examKey" TEXT,
ADD COLUMN "section" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "department" TEXT,
ADD COLUMN "section" TEXT;

-- CreateIndex
CREATE INDEX "ExamAssignment_examKey_idx" ON "ExamAssignment"("examKey");
