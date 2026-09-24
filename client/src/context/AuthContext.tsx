import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, setUnauthorizedHandler } from "../services/api";
import { useToast } from "../components/Toast";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (loginId: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const userRef = useRef<User | null>(null);
  userRef.current = user;

  // Any 401 after login = session ended (expired, revoked, or signed in on another device).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (userRef.current) toast.error("Your session ended. Please sign in again.");
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, [toast]);

  useEffect(() => {
    api<{ user: User }>("/auth/me").then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (loginId: string, password: string) => {
    const r = await api<{ user: User }>("/auth/login", { method: "POST", body: { loginId, password } });
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
};
