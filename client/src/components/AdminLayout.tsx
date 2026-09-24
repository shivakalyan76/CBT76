import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { btn } from "./ui";

const link = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 ${isActive ? "bg-blue-100 text-blue-900" : "text-slate-700 hover:bg-slate-100"}`;

export default function AdminLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="font-semibold">CBT Admin</span>
            <nav aria-label="Main" className="flex gap-1">
              <NavLink to="/admin" end className={link}>Dashboard</NavLink>
              <NavLink to="/admin/exams" className={link}>Exams</NavLink>
              <NavLink to="/admin/students" className={link}>Students</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline">{user?.name}</span>
            <button onClick={logout} className={btn}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4"><Outlet /></main>
    </div>
  );
}
