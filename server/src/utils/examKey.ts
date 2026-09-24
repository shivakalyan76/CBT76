import { randomInt } from "crypto";
import { prisma } from "../db";

/**
 * Generates a cryptographically secure 4-digit numeric string (1000..9999).
 */
export function generate4DigitKey(): string {
  return randomInt(1000, 10000).toString();
}

/**
 * Generates a unique 4-digit exam key for a specific exam assignment,
 * ensuring no collisions among active assignments for the same exam.
 */
export async function generateUniqueExamKey(examId: string): Promise<string> {
  const existing = await prisma.examAssignment.findMany({
    where: { examId },
    select: { examKey: true },
  });
  const used = new Set(existing.map((a) => a.examKey).filter(Boolean));

  for (let i = 0; i < 50; i++) {
    const key = generate4DigitKey();
    if (!used.has(key)) {
      return key;
    }
  }
  return generate4DigitKey();
}
