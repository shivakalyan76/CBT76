import { ApiError } from "../services/api";

export function messageFor(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return "Your session has ended. Please sign in again.";
    if (e.status === 403) return "You don't have permission to do that.";
    if (e.status === 429) return "Too many requests. Please wait a moment and try again.";
    if (e.status >= 500) return "Server error. Please try again in a moment.";
    return e.message; // 400 / 404 / 409 messages come from the server and are user-readable
  }
  return "Network error. Check your connection and try again.";
}

/** Zod field errors: { fieldName: [messages] } (only present on 400 validation responses). */
export function fieldErrors(e: unknown): Record<string, string[]> {
  if (e instanceof ApiError && e.status === 400 && e.details && typeof e.details === "object" && !Array.isArray(e.details)) {
    return e.details as Record<string, string[]>;
  }
  return {};
}

/** List-style details: string[] (publish problems) or {row,message}[] (CSV import). */
export function listDetails(e: unknown): unknown[] {
  return e instanceof ApiError && Array.isArray(e.details) ? e.details : [];
}

export const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function randomPassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}
