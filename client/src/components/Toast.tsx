import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { messageFor } from "../utils/errors";

interface T { id: number; kind: "success" | "error"; text: string }
interface Ctx { success: (text: string) => void; error: (e: unknown) => void }
const C = createContext<Ctx | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const dismiss = (id: number) => setItems((l) => l.filter((t) => t.id !== id));
  const push = useCallback((kind: T["kind"], text: string) => {
    const id = ++seq;
    setItems((l) => [...l, { id, kind, text }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === "error" ? 8000 : 4000);
  }, []);
  const success = useCallback((t: string) => push("success", t), [push]);
  const error = useCallback((e: unknown) => push("error", typeof e === "string" ? e : messageFor(e)), [push]);
  return (
    <C.Provider value={{ success, error }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`flex items-start justify-between gap-2 rounded border p-3 text-sm shadow ${t.kind === "error" ? "border-red-300 bg-red-50 text-red-800" : "border-green-300 bg-green-50 text-green-800"}`}>
            <span><strong>{t.kind === "error" ? "Error: " : "Done: "}</strong>{t.text}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="font-bold">×</button>
          </div>
        ))}
      </div>
    </C.Provider>
  );
}
export const useToast = () => { const c = useContext(C); if (!c) throw new Error("useToast outside provider"); return c; };
