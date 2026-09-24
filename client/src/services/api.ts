export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };

// Configurable API Base URL from Vite environment variable
const RAW_API_BASE = (import.meta.env?.VITE_API_URL as string | undefined) || "";
export const API_BASE_URL = RAW_API_BASE.replace(/\/$/, "");

export function buildApiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE_URL) {
    return `/api${cleanPath}`;
  }
  if (API_BASE_URL.endsWith("/api")) {
    return `${API_BASE_URL}${cleanPath}`;
  }
  return `${API_BASE_URL}/api${cleanPath}`;
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const url = buildApiUrl(path);
  const res = await fetch(url, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A 401 anywhere except the login form means the session ended (expired, revoked, signed in elsewhere).
    if (res.status === 401 && path !== "/auth/login") onUnauthorized?.();
    throw new ApiError(res.status, data.error ?? "Request failed", data.details);
  }
  return data as T;
}
