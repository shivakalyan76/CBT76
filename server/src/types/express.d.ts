import type { Role } from "../generated/prisma/client";
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; name: string; loginId: string; role: Role };
      sessionId?: string;
    }
  }
}
export {};
