import { useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "../../hooks/useAsync";
import { deleteExam, listExams } from "../../services/adminApi";
import { Empty, ErrorState, Loading, Pagination, StatusBadge } from "../../components/Common";
import { ConfirmDialog } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { btn, btnPrimary, input } from "../../components/ui";
import { fmt } from "../../utils/errors";
import type { Exam } from "../../types";

const SIZE = 10;
export default function ExamList() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [del, setDel] = useState<Exam | null>(null);
  const { data, error, loading, reload } = useAsync(() => listExams(page, SIZE, status || undefined), [page, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Exams</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm">Status <select className="rounded border px-2 py-1.5" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select></label>
          <Link to="/admin/exams/new" className={btnPrimary}>New exam</Link>
        </div>
      </div>
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : data!.items.length === 0 ? (
        <Empty title={status ? "No exams with this status" : "No exams yet"} hint="Create an exam, add questions, assign students, then publish." action={<Link to="/admin/exams/new" className={btnPrimary}>Create exam</Link>} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100"><tr>{["Title", "Status", "Window", "Min", "Questions", "Assigned", "Attempts", ""].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
              <tbody>{data!.items.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-2 font-medium"><Link className="text-blue-700 hover:underline" to={`/admin/exams/${e.id}`}>{e.title}</Link></td>
                  <td className="p-2"><StatusBadge status={e.status} /></td>
                  <td className="p-2 whitespace-nowrap text-slate-600">{fmt(e.startTime)} → {fmt(e.endTime)}</td>
                  <td className="p-2">{e.durationMinutes}</td>
                  <td className="p-2">{e._count?.questions}</td><td className="p-2">{e._count?.assignments}</td><td className="p-2">{e._count?.attempts}</td>
                  <td className="p-2 whitespace-nowrap"><Link className={btn} to={`/admin/exams/${e.id}/edit`}>Edit</Link>{" "}<button className={btn} onClick={() => setDel(e)}>Delete</button></td>
                </tr>))}</tbody>
            </table>
          </div>
          <Pagination page={data!.page} pageSize={data!.pageSize} total={data!.total} onPage={setPage} />
        </>
      )}
      {del && (
        <ConfirmDialog title="Delete exam?" danger confirmLabel="Delete" onClose={() => setDel(null)}
          message={<>Delete <strong>{del.title}</strong> with its questions and assignments? This cannot be undone.</>}
          onConfirm={async () => {
            try { await deleteExam(del.id); toast.success("Exam deleted"); setDel(null); if (data!.items.length === 1 && page > 1) setPage(page - 1); else reload(); }
            catch (e) { toast.error(e); setDel(null); }
          }} />
      )}
    </div>
  );
}
