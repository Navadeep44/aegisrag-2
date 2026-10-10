import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, Sparkles, KeyRound } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Building2 as Building2Icon } from "lucide-react";
import { Button } from "../components/ui/Button";
import { StatCard } from "../components/ui/StatCard";
import { TableSkeleton } from "../components/ui/Skeleton";
import { Notice } from "../components/ui/Notice";
import { EmptyState } from "../components/ui/EmptyState";
import { ClearancePill, RolePill, StatusPill } from "../components/ui/StatusPill";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { type DepartmentInsights as DeptInsightsType } from "../lib/types";

export default function DepartmentInsights() {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  const deptName = insights?.department_name || user?.department_id || "Department";

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Page Header with Single Primary Action */}
      <PageHeader
        icon={Building2Icon}
        title={`${deptName} Department`}
        subtitle="Members, shared docs and activity."
        action={
          <div className="flex items-center gap-2.5">
            <Link to="/app/access-requests">
              <Button kind="secondary" className="flex items-center gap-1.5">
                <KeyRound className="h-4 w-4" />
                <span>Request access</span>
              </Button>
            </Link>
            <Link to="/app/ask">
              <Button kind="primary" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                <span>Ask this department's AI</span>
              </Button>
            </Link>
          </div>
        }
      />

      {error && <Notice tone="error">{error}</Notice>}

      {/* 2. Stat Strip */}
      {loading && !insights ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <TableSkeleton rows={2} />
        </div>
      ) : insights ? (
        <section aria-label="Department stats" className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Team Members"
            value={insights.members_count}
            subtext={`Assigned to ${deptName} organizational unit`}
          />
          <StatCard
            label="Documents shared with this department"
            value={insights.department_documents_count}
            subtext="Available in departmental knowledge boundary"
            tone="emerald"
          />
          <StatCard
            label="Questions Asked"
            value={insights.total_queries_run}
            subtext="By departmental team members"
          />
        </section>
      ) : null}

      {insights && (
        <>
          {/* 3. Department Personnel Table */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="display text-2xl font-semibold text-ink">
                  Team Members ({insights.members.length})
                </h2>
                <p className="text-xs text-muted">
                  Colleagues assigned to this department unit, their active roles and clearance tiers.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
              <table className="w-full text-left text-sm hidden md:table">
                <thead className="border-b border-line bg-surface-subtle/70 text-xs text-muted font-mono uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 font-medium">Member</th>
                    <th className="px-4 py-3 font-medium">Clearance</th>
                    <th className="px-4 py-3 font-medium">Roles</th>
                    <th className="px-4 py-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {insights.members.map((m) => (
                    <tr key={m.id} className="hover:bg-surface-hover/60 transition-colors">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-ink text-sm">
                          {m.name}{" "}
                          {m.id === user?.id && (
                            <span className="text-xs text-accent font-normal">(You)</span>
                          )}
                        </p>
                        <p className="text-[0.7rem] text-muted font-mono">{m.email}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <ClearancePill clearance={m.clearance} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {m.roles.map((r) => (
                            <RolePill key={r} role={r} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <StatusPill status={m.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile View */}
              <div className="divide-y divide-line md:hidden">
                {insights.members.map((m) => (
                  <div key={m.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-ink text-sm">{m.name}</p>
                        <p className="text-xs text-muted font-mono">{m.email}</p>
                      </div>
                      <StatusPill status={m.status} />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <ClearancePill clearance={m.clearance} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 4. Department Knowledge Base Table */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="display text-2xl font-semibold text-ink">
                  Documents shared with this department ({insights.department_documents?.length || 0})
                </h2>
                <p className="text-xs text-muted">
                  Documents with explicit boundary grants for team members.
                </p>
              </div>

              <Link to="/app/documents">
                <Button kind="secondary">View all in catalog</Button>
              </Link>
            </div>

            {!insights.department_documents || insights.department_documents.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No documents shared with this department yet"
                description="Team members currently search standard company-wide documents. You can grant access to department-specific documents in the catalog."
                actionText="Go to catalog"
                onAction={() => navigate("/app/documents")}
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
                <table className="w-full text-left text-sm hidden md:table">
                  <thead className="border-b border-line bg-surface-subtle/70 text-xs text-muted font-mono uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 font-medium">Document Title</th>
                      <th className="px-4 py-3 font-medium">Format</th>
                      <th className="px-4 py-3 font-medium">Classification</th>
                      <th className="px-4 py-3 font-medium text-right">Access Boundary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {insights.department_documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-surface-hover/60 transition-colors">
                        <td className="px-4 py-3.5 font-semibold text-ink">{doc.title}</td>
                        <td className="px-4 py-3.5 text-xs font-mono uppercase text-muted">
                          {doc.kind}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="rounded bg-line px-2 py-0.5 text-xs font-semibold text-ink">
                            {doc.classification_label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right text-xs text-allow font-medium">
                          Granted to {insights.department_name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile View */}
                <div className="divide-y divide-line md:hidden">
                  {insights.department_documents.map((doc) => (
                    <div key={doc.id} className="p-4 space-y-1.5">
                      <p className="font-semibold text-ink text-sm">{doc.title}</p>
                      <div className="flex items-center justify-between text-xs text-muted">
                        <span className="uppercase font-mono text-[0.7rem]">{doc.kind}</span>
                        <span className="text-allow font-medium">Shared with {insights.department_name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 5. Department Recent Activity Log */}
          {insights.recent_activities.length > 0 && (
            <section className="space-y-4">
              <div className="border-b border-line pb-3">
                <h2 className="display text-2xl font-semibold text-ink">Recent Team Activity</h2>
                <p className="text-xs text-muted">Recent knowledge operations executed by department personnel.</p>
              </div>

              <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line bg-surface-subtle/70 text-xs text-muted font-mono uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 font-medium">Timestamp</th>
                      <th className="px-4 py-3 font-medium">Colleague</th>
                      <th className="px-4 py-3 font-medium">Activity</th>
                      <th className="px-4 py-3 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-xs">
                    {insights.recent_activities.map((act) => (
                      <tr key={act.id} className="hover:bg-surface-hover/60">
                        <td className="px-4 py-3 font-mono text-muted">
                          {new Date(act.time).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-semibold text-ink">{act.actor}</td>
                        <td className="px-4 py-3 font-mono text-ink">{act.action}</td>
                        <td className="px-4 py-3 text-right">
                          <StatusPill status={act.decision} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
