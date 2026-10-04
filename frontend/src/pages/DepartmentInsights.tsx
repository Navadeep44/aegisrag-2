import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { LEVELS, type DepartmentInsights as DeptInsightsType } from "../lib/types";

export default function DepartmentInsights() {
  const { user } = useAuth();
  const [insights, setInsights] = useState<DeptInsightsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = () => {
    setLoading(true);
    setError("");
    api<DeptInsightsType>("/department/insights")
      .then(setInsights)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader title={insights ? `${insights.department_name} Department Insights` : "Department Insights"}>
          Department knowledge boundary oversight, team activity tracking, and operational RAG metrics.
        </PageHeader>
        <div className="flex gap-2">
          <Link to="/app/ask">
            <Button kind="secondary">Ask Dept AI</Button>
          </Link>
          <Link to="/app/access-requests">
            <Button>Request Access</Button>
          </Link>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading && !insights && (
        <div className="rounded-xl border border-line bg-surface p-8 text-center text-muted">
          Loading department operational metrics...
        </div>
      )}

      {insights && (
        <>
          {/* Metrics summary */}
          <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
              <p className="text-xs uppercase tracking-wide text-muted">Department</p>
              <p className="display mt-1 text-2xl font-semibold text-ink">{insights.department_name}</p>
              <p className="text-[0.7rem] font-mono text-muted mt-0.5">{insights.department_id}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
              <p className="text-xs uppercase tracking-wide text-muted">Team Members</p>
              <p className="display mt-1 text-3xl font-semibold text-ink">{insights.members_count}</p>
              <p className="text-[0.7rem] text-muted mt-0.5">Assigned to this unit</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
              <p className="text-xs uppercase tracking-wide text-muted">Dept Documents</p>
              <p className="display mt-1 text-3xl font-semibold text-ink">{insights.department_documents_count}</p>
              <p className="text-[0.7rem] text-muted mt-0.5">Boundary granted docs</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
              <p className="text-xs uppercase tracking-wide text-muted">Queries Executed</p>
              <p className="display mt-1 text-3xl font-semibold text-ink">{insights.total_queries_run}</p>
              <p className="text-[0.7rem] text-muted mt-0.5">By team members</p>
            </div>
          </section>

          {/* Department Members Table */}
          <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="display text-2xl">Department Personnel ({insights.members.length})</h2>
                <p className="mt-1 text-xs text-muted">
                  Team members assigned to this department unit, their operational roles and clearance ratings.
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-line/20 text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Member</th>
                    <th className="px-4 py-3 font-medium">Assigned Roles</th>
                    <th className="px-4 py-3 font-medium">Clearance</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {insights.members.map((m) => (
                    <tr key={m.id} className="hover:bg-white/50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{m.name} {m.id === user?.id && <span className="text-xs text-accent font-normal">(You)</span>}</p>
                        <p className="text-xs font-mono text-muted">{m.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {m.roles.map((r) => (
                            <span key={r} className="rounded bg-line px-1.5 py-0.5 text-[0.7rem] font-medium text-ink">
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-ink">
                          {LEVELS[m.clearance] ?? m.clearance} (L{m.clearance})
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${
                            m.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {insights.members.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-xs text-muted">
                        No team members currently assigned to this department.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Department Activity Log */}
          <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
            <h2 className="display text-2xl">Recent Department Activity</h2>
            <p className="mt-1 text-xs text-muted">
              Audit events, query executions, and knowledge operations recorded for department personnel.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-line/20 text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Timestamp</th>
                    <th className="px-4 py-3 font-medium">Team Member</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {insights.recent_activities.map((act) => (
                    <tr key={act.id} className="hover:bg-white/50 text-xs">
                      <td className="px-4 py-2.5 font-mono text-muted">{new Date(act.time).toLocaleString()}</td>
                      <td className="px-4 py-2.5 font-medium text-ink">{act.actor}</td>
                      <td className="px-4 py-2.5 font-mono">{act.action}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${
                            act.decision === "allowed" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {act.decision}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {insights.recent_activities.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-xs text-muted">
                        No recent department activities recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
