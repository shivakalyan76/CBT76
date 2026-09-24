import { useEffect, useState, type FormEvent } from "react";
import { useAsync } from "../../hooks/useAsync";
import { createStudent, importStudents, listStudents, patchStudent } from "../../services/adminApi";
import { Empty, ErrorState, FieldError, Loading, Pagination } from "../../components/Common";
import Modal, { ConfirmDialog } from "../../components/Modal";
import CsvImportModal from "../../components/CsvImportModal";
import CredentialsModal from "../../components/CredentialsModal";
import { useToast } from "../../components/Toast";
import { btn, btnPrimary, input } from "../../components/ui";
import { fieldErrors, fmt, messageFor, randomPassword } from "../../utils/errors";
import type { Credential, Student } from "../../types";

const TEMPLATE = "name,loginId,email,password\nAsha Rao,CSE001,asha@example.com,\nRavi Kumar,CSE002,,\n";

function AddStudent({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Credential | null) => void }) {
  const [f, setF] = useState({ name: "", loginId: "", email: "", password: "" });
  const [err, setErr] = useState(""); const [fe, setFe] = useState<Record<string, string[]>>({}); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(""); setFe({});
    try {
      const r = await createStudent({ name: f.name, loginId: f.loginId, email: f.email || null, password: f.password || undefined });
      onCreated(r.generatedPassword ? { loginId: r.loginId, name: r.name, password: r.generatedPassword } : null);
    } catch (x) { setFe(fieldErrors(x)); setErr(Object.keys(fieldErrors(x)).length ? "Please fix the highlighted fields." : messageFor(x)); } finally { setBusy(false); }
  }
  const row = (k: keyof typeof f, label: string, type = "text", extra = {}) => (
    <label className="block text-sm font-medium">{label}<input type={type} className={input} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} /><FieldError msgs={fe[k]} /></label>
  );
  return (
    <Modal title="Add student" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {err && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{err}</p>}
        {row("name", "Full name", "text", { required: true, autoFocus: true })}
        {row("loginId", "Login ID (roll number)", "text", { required: true })}
        {row("email", "Email (optional)", "email")}
        {row("password", "Password (blank = generate one)", "text", { minLength: 8, autoComplete: "off" })}
        <div className="flex justify-end gap-2"><button type="button" className={btn} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy}>{busy ? "Saving…" : "Create"}</button></div>
      </form>
    </Modal>
  );
}

function ResetPassword({ student, onClose }: { student: Student; onClose: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [err, setErr] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { await patchStudent(student.id, { password: pw }); setDone(true); toast.success("Password reset; student signed out everywhere"); }
    catch (x) { setErr(messageFor(x)); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Reset password: ${student.name}`} onClose={onClose}>
      {done ? (
        <div className="space-y-3 text-sm">
          <p>New password for <strong>{student.loginId}</strong>:</p>
          <p className="rounded border bg-slate-50 p-2 font-mono">{pw}</p>
          <p className="text-amber-800">Shown only now. Share it securely.</p>
          <div className="flex justify-end"><button className={btnPrimary} onClick={onClose}>Done</button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3 text-sm">
          {err && <p role="alert" className="rounded bg-red-50 p-2 text-red-800">{err}</p>}
          <label className="block font-medium">New password (min 8 characters)
            <div className="flex gap-2"><input className={input} value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required autoComplete="off" autoFocus />
              <button type="button" className={`${btn} mt-1`} onClick={() => setPw(randomPassword())}>Generate</button></div></label>
          <p className="text-slate-600">The student will be signed out of all sessions.</p>
          <div className="flex justify-end gap-2"><button type="button" className={btn} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy}>{busy ? "Saving…" : "Reset password"}</button></div>
        </form>
      )}
    </Modal>
  );
}

export default function Students() {
  const toast = useToast();
  const [search, setSearch] = useState(""); const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  const { data, error, loading, reload } = useAsync(() => listStudents({ page, pageSize: 15, search: q }), [page, q]);
  const [adding, setAdding] = useState(false); const [importing, setImporting] = useState(false);
  const [creds, setCreds] = useState<{ title: string; list: Credential[] } | null>(null);
  const [reset, setReset] = useState<Student | null>(null); const [toggle, setToggle] = useState<Student | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Students</h1>
        <div className="flex gap-2"><button className={btn} onClick={() => setImporting(true)}>Import CSV</button><button className={btnPrimary} onClick={() => setAdding(true)}>Add student</button></div>
      </div>
      <input className={`${input} mt-0 max-w-sm`} placeholder="Search by name or login ID" aria-label="Search students" value={search} onChange={(e) => setSearch(e.target.value)} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : data!.items.length === 0 ? (
        <Empty title={q ? "No students match your search" : "No students yet"} hint={q ? undefined : "Add students one by one or import a CSV."} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100"><tr>{["Name", "Login ID", "Email", "Status", "Created", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
              <tbody>{data!.items.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-2 font-medium">{s.name}</td><td className="p-2">{s.loginId}</td><td className="p-2 text-slate-600">{s.email ?? "—"}</td>
                  <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${s.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{s.isActive ? "Active" : "Inactive"}</span></td>
                  <td className="p-2 whitespace-nowrap text-slate-600">{fmt(s.createdAt)}</td>
                  <td className="p-2 whitespace-nowrap"><button className={btn} onClick={() => setReset(s)}>Reset password</button>{" "}<button className={btn} onClick={() => setToggle(s)}>{s.isActive ? "Deactivate" : "Activate"}</button></td>
                </tr>))}</tbody>
            </table>
          </div>
          <Pagination page={data!.page} pageSize={data!.pageSize} total={data!.total} onPage={setPage} />
        </>
      )}
      {adding && <AddStudent onClose={() => setAdding(false)} onCreated={(c) => { setAdding(false); toast.success("Student created"); reload(); if (c) setCreds({ title: "Student created", list: [c] }); }} />}
      {importing && <CsvImportModal title="Import students from CSV" templateName="students-template.csv" template={TEMPLATE}
        help={<>Columns: <code>name, loginId, email, password</code>. Leave <code>password</code> blank to generate one (shown once after import). If any row is invalid or a login ID/email already exists, <strong>nothing</strong> is imported.</>}
        run={importStudents} onClose={() => setImporting(false)}
        onDone={(r) => { setImporting(false); toast.success(`Imported ${r.imported} student(s)`); reload(); setCreds({ title: `Imported ${r.imported} student(s)`, list: r.generatedCredentials }); }} />}
      {creds && <CredentialsModal title={creds.title} credentials={creds.list} onClose={() => setCreds(null)} />}
      {reset && <ResetPassword student={reset} onClose={() => setReset(null)} />}
      {toggle && <ConfirmDialog title={toggle.isActive ? "Deactivate student?" : "Activate student?"} danger={toggle.isActive} confirmLabel={toggle.isActive ? "Deactivate" : "Activate"} onClose={() => setToggle(null)}
        message={toggle.isActive ? <><strong>{toggle.name}</strong> will be signed out and unable to log in until reactivated.</> : <><strong>{toggle.name}</strong> will be able to log in again.</>}
        onConfirm={async () => { try { await patchStudent(toggle.id, { isActive: !toggle.isActive }); toast.success("Student updated"); reload(); } catch (e) { toast.error(e); } setToggle(null); }} />}
    </div>
  );
}
