import { Link } from "react-router-dom";
import { useAsync } from "../../hooks/useAsync";
import { listExams, listStudents } from "../../services/adminApi";
import { Empty, ErrorState, Loading, StatusBadge } from "../../components/Common";
import { card } from "../../components/ui";
import { fmt } from "../../utils/errors";

export default function Dashboard() {
  const { data, error, loading, reload } = useAsync(
    async () => { const [exams, students] = await Promise.all([listExams(1, 100), listStudents({ page: 1, pageSize: 1 })]); return { exams, students }; }, []);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  const { exams, students } = data!;
  const now = Date.now();
  const pub = exams.items.filter((e) => e.status === "PUBLISHED");
  const active = pub.filter((e) => new Date(e.startTime).getTime() <= now && now <= new Date(e.endTime).getTime());
  const upcoming = pub.filter((e) => new Date(e.startTime).getTime() > now);
  const stats: [string, number][] = [
    ["Students", students.total], ["Exams", exams.total], ["Published", pub.length],
    ["Drafts", exams.items.filter((e) => e.status === "DRAFT").length], ["Active now", active.length], ["Upcoming", upcoming.length],
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {stats.map(([label, n]) => <div key={label} className={card}><p className="text-2xl font-semibold">{n}</p><p className="text-sm text-slate-600">{label}</p></div>)}
      </div>
      {exams.total > exams.items.length && <p className="text-xs text-slate-500">Published/draft/active counts cover the {exams.items.length} most recent exams.</p>}
      <section className={card}>
        <div className="mb-2 flex items-center justify-between"><h2 className="font-medium">Recent exams</h2><Link to="/admin/exams/new" className="text-sm text-blue-700 underline">New exam</Link></div>
        {exams.items.length === 0 ? <Empty title="No exams yet" hint="Create your first exam to get started." /> : (
          <ul className="divide-y">
            {exams.items.slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <Link to={`/admin/exams/${e.id}`} className="font-medium text-blue-700 hover:underline">{e.title}</Link>
                <span className="flex items-center gap-3 text-slate-600"><span className="hidden sm:inline">{fmt(e.startTime)}</span><StatusBadge status={e.status} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-sm text-slate-500">Scores, completion rates and charts appear once students can take exams (later phases).</p>
    </div>
  );
}
