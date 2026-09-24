import { useState, type ReactNode } from "react";
import Modal from "./Modal";
import { btn, btnPrimary } from "./ui";
import { ApiError } from "../services/api";
import { messageFor } from "../utils/errors";

interface RowError { row: number; message: string }
const isRowErrors = (d: unknown): d is RowError[] => Array.isArray(d) && d.length > 0 && typeof d[0] === "object" && d[0] !== null && "row" in d[0];

export default function CsvImportModal<R>(p: {
  title: string; help: ReactNode; template: string; templateName: string;
  run: (csv: string) => Promise<R>; onDone: (result: R) => void; onClose: () => void;
}) {
  const [csv, setCsv] = useState(""); const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""); const [rows, setRows] = useState<RowError[]>([]);

  async function pick(f: File | undefined) {
    setMessage(""); setRows([]);
    if (!f) return;
    if (f.size > 900_000) { setCsv(""); setFileName(""); return setMessage("File is too large (limit about 900 KB). Split it into smaller files."); }
    setFileName(f.name); setCsv(await f.text());
  }
  async function submit() {
    setBusy(true); setMessage(""); setRows([]);
    try { p.onDone(await p.run(csv)); }
    catch (e) {
      setMessage(messageFor(e));
      if (e instanceof ApiError && isRowErrors(e.details)) setRows(e.details);
    } finally { setBusy(false); }
  }
  function template() {
    const url = URL.createObjectURL(new Blob([p.template], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = p.templateName; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <Modal title={p.title} onClose={p.onClose} wide>
      <div className="space-y-3 text-sm">
        <div className="text-slate-600">{p.help}</div>
        <button className={btn} onClick={template}>Download template</button>
        <label className="block font-medium">CSV file
          <input type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0])} className="mt-1 block w-full text-sm" />
        </label>
        {fileName && <p className="text-slate-600">{fileName} · {csv.split(/\r?\n/).filter(Boolean).length - 1} data row(s)</p>}
        {message && <p role="alert" className="rounded bg-red-50 p-2 text-red-800">{message}</p>}
        {rows.length > 0 && (
          <div className="max-h-64 overflow-auto rounded border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100"><tr><th className="p-2 w-20">CSV row</th><th className="p-2">Problem</th></tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i} className="border-t"><td className="p-2 font-mono">{r.row}</td><td className="p-2">{r.message}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button className={btn} onClick={p.onClose} disabled={busy}>Cancel</button>
          <button className={btnPrimary} onClick={submit} disabled={busy || !csv}>{busy ? "Importing…" : "Import"}</button>
        </div>
      </div>
    </Modal>
  );
}
