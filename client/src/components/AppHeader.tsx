import { useAuth } from "../context/AuthContext";

export default function AppHeader({ title }: { title: string }) {
  const { user, logout } = useAuth();
  return (
    <header className="flex items-center justify-between border-b bg-white px-4 py-3 sm:px-8">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden text-slate-600 sm:inline">{user?.name}</span>
        <button onClick={logout} className="rounded border px-3 py-1.5 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600">
          Sign out
        </button>
      </div>
    </header>
  );
}
