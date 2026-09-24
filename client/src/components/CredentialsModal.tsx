import Modal from "./Modal";
import { btn, btnPrimary } from "./ui";
import { useToast } from "./Toast";
import type { Credential } from "../types";

export default function CredentialsModal({ title, credentials, onClose }: { title: string; credentials: Credential[]; onClose: () => void }) {
  const toast = useToast();
  const hasKeys = credentials.some((c) => !!c.examKey);
  const colHeader = hasKeys ? "Exam Key" : "Password";
  const csv = "loginId,name,keyOrPassword\n" + credentials.map((c) => [c.loginId, c.name, c.examKey || c.password || ""].map((v) => `"${(v || "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const copy = async () => { try { await navigator.clipboard.writeText(csv); toast.success("Copied to clipboard"); } catch { toast.error("Copy failed; use Download instead"); } };
  const download = () => {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = hasKeys ? "exam-keys.csv" : "student-credentials.csv"; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Modal title={title} onClose={onClose} wide>
      <p role="alert" className="mb-3 rounded border border-blue-300 bg-blue-50 p-2 text-sm text-blue-900">
        {hasKeys ? "Assigned student exam keys are listed below. Share these 4-digit keys with the students." : "These credentials are shown below. Copy or download them now and share them securely."}
      </p>
      {credentials.length === 0 ? <p className="text-sm text-slate-600">No credentials to display.</p> : (
        <div className="max-h-72 overflow-auto rounded border">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-100"><tr><th className="p-2">Login ID / Enrollment</th><th className="p-2">Name</th><th className="p-2">{colHeader}</th></tr></thead>
            <tbody>{credentials.map((c) => <tr key={c.loginId} className="border-t"><td className="p-2 font-mono">{c.loginId}</td><td className="p-2">{c.name}</td><td className="p-2 font-mono font-bold text-blue-800">{c.examKey || c.password || "—"}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        {credentials.length > 0 && <><button className={btn} onClick={copy}>Copy CSV</button><button className={btn} onClick={download}>Download CSV</button></>}
        <button className={btnPrimary} onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
