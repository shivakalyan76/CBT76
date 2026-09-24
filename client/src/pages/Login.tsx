import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { homeFor } from "../components/ProtectedRoute";
import { ApiError } from "../services/api";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user?.role === "ADMIN") return <Navigate to="/admin" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const u = await login(loginId, password);
      nav(homeFor(u.role), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? "Too many attempts. Try again later." : err instanceof ApiError ? err.message : "Network error");
    } finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Sign in to CBT Portal</h1>
        {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <label className="block text-sm font-medium">
          Login ID or email
          <input value={loginId} onChange={(e) => setLoginId(e.target.value)} required autoFocus autoComplete="username"
            className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600" />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
            className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600" />
        </label>
        <button disabled={busy} className="w-full rounded bg-blue-700 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="border-t pt-3 text-center">
          <a href="/" className="text-xs text-slate-500 hover:text-blue-600">
            ← Return to Student Exam Entry
          </a>
        </div>
      </form>
    </main>
  );
}
