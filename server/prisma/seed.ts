import "dotenv/config";
import argon2 from "argon2";
import { prisma } from "../src/db";
async function main() {
  const adminPw = await argon2.hash(process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe-Admin-123");
  const stuPw = await argon2.hash(process.env.SEED_STUDENT_PASSWORD ?? "ChangeMe-Student-123");
  await prisma.user.upsert({
    where: { loginId: "admin" }, update: {},
    create: { name: "Demo Admin", loginId: "admin", email: "admin@example.com", passwordHash: adminPw, role: "ADMIN" },
  });
  for (const [i, n] of ["Asha Rao", "Ravi Kumar", "Meera Iyer"].entries()) {
    const loginId = `student${i + 1}`;
    await prisma.user.upsert({
      where: { loginId }, update: {},
      create: { name: n, loginId, passwordHash: stuPw, role: "STUDENT" },
    });
  }
  console.log("Seeded: admin, student1..student3");
}
main().finally(() => prisma.$disconnect());
