import { prisma } from "../src/db";

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "cameraRequired" BOOLEAN NOT NULL DEFAULT false;`);
  console.log("Exam table successfully updated with cameraRequired column.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
