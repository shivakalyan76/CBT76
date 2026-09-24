import type { ReactNode } from "react";
import { btn } from "./ui";
import { messageFor } from "../utils/errors";
import type { ExamStatus } from "../types";

export const Loading = ({ text = "Loading…" }: { text?: string }) => <div className="p-6 text-sm text-slate-500" role="status">{text}</div>;

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800">
      <p>{messageFor(error)}</p>
      {onRetry && <button className={`${btn} mt-2`} onClick={onRetry}>Try again</button>}
    </div>
  );
}

export const Empty = ({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) => (
  <div className="rounded-lg border border-dashed p-10 text-center">
    <p className="font-medium">{title}</p>
    {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    {action && <div className="mt-3">{action}</div>}
  </div>
);

const tone: Record<ExamStatus, string> = { DRAFT: "bg-slate-200 text-slate-800", PUBLISHED: "bg-green-100 text-green-800", ARCHIVED: "bg-amber-100 text-amber-800" };
export const StatusBadge = ({ status }: { status: ExamStatus }) => (
  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${tone[status]}`}>{status}</span>
);

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Pagination">
      <span className="text-slate-600">{total} total · page {page} of {pages}</span>
      <span className="flex gap-2">
        <button className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </span>
    </nav>
  );
}

export const FieldError = ({ msgs }: { msgs?: string[] }) => (msgs?.length ? <p className="mt-1 text-xs text-red-700" role="alert">{msgs.join("; ")}</p> : null);
