import { useEffect, useId, useState, type ReactNode } from "react";
import { btn, btnDanger, btnPrimary } from "./ui";

export default function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const id = useId();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={id} className={`mt-8 w-full rounded-lg bg-white p-5 shadow-xl ${wide ? "max-w-3xl" : "max-w-md"}`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 id={id} className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-xl leading-none text-slate-500 hover:text-slate-800">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog(p: { title: string; message: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={p.title} onClose={p.onClose}>
      <div className="mb-4 text-sm text-slate-700">{p.message}</div>
      <div className="flex justify-end gap-2">
        <button className={btn} onClick={p.onClose} disabled={busy}>Cancel</button>
        <button className={p.danger ? btnDanger : btnPrimary} disabled={busy} autoFocus
          onClick={async () => { setBusy(true); try { await p.onConfirm(); } finally { setBusy(false); } }}>
          {busy ? "Working…" : p.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
