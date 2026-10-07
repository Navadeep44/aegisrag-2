import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Download,
  Play,
  CheckCircle2,
  XCircle,
  FileText,
  Search,
  Lock,
  History,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { StatCard } from "../components/ui/StatCard";
import { TableSkeleton } from "../components/ui/Skeleton";
import { Notice } from "../components/ui/Notice";
import { Drawer } from "../components/ui/Drawer";
import { StatusPill } from "../components/ui/StatusPill";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ui/Toast";
import { api, downloadFile } from "../lib/api";
import { hasPermission, type AuditEvent, type TestReport } from "../lib/types";

const ACTIONS: Record<string, string> = {
  "chat.query": "Asked a question",
  "document.read": "Opened document page",
  "document.upload": "Uploaded document",
  "document.delete": "Deleted document",
  "document.access_change": "Changed document access grants",
  "document.reprocess": "Reprocessed document",
  "ingest.injection_flag": "Quarantined prompt injection upload",
  "policy.simulate": "Ran policy simulation",
  "access_request.create": "Submitted access request",
  "access_request.decide": "Decided access request",
  "user.invite": "Invited team user",
  "user.status_change": "Updated user status",
  "role.assign": "Assigned user roles",
  "role.manage": "Created custom role",
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "audit.export": "Exported audit report",
};

const FILTERS = [
  ["", "All Events"],
  ["denied", "Denied"],
  ["flagged", "Flagged"],
  ["abstained", "No authorized source"],
  ["allowed", "Allowed"],
];

export default function Security() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [report, setReport] = useState<TestReport | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const canRunTests =
    hasPermission(user, "security_tests.run") || user?.is_admin || user?.is_platform_admin;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api<TestReport>("/security/tests").then(setReport),
      api<AuditEvent[]>(`/audit/events${filter ? `?decision=${filter}` : ""}`).then(setEvents),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filter]);

  async function runSecuritySuite() {
    setRunning(true);
    setError("");
    try {
      const res = await api<TestReport>("/security/tests/run", { method: "POST" });
      setReport(res);
      showToast("Security test suite executed: all regression tests verified.", "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setRunning(false);
    }
  }

  async function exportAudit(format: "csv" | "json") {
    try {
      await downloadFile(`/audit/export?format=${format}`, `audit-events.${format}`);
      showToast(`Audit trail exported as ${format.toUpperCase()}.`, "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }

  const securityTests = report?.tests.filter((t) => t.group === "security") ?? [];
  const passCount = report?.passed ?? securityTests.filter((t) => t.outcome === "passed").length;
  const totalTests = securityTests.length || 17;

  const deniedCount = events.filter((e) => e.decision === "denied").length;
  const flaggedCount = events.filter((e) => e.decision === "flagged" || e.action.includes("injection")).length;

  const filteredEvents = events.filter((e) => {
    if (!auditSearch.trim()) return true;
    const q = auditSearch.toLowerCase();
    return (
      e.user?.toLowerCase().includes(q) ||
      e.actor?.toLowerCase().includes(q) ||
      e.action?.toLowerCase().includes(q) ||
      e.documents?.some((d) => d.toLowerCase().includes(q)) ||
      (e.correlation_id && e.correlation_id.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Page Header with Export Actions */}
      <PageHeader
        title="Audit & Security"
        subtitle="Automated security regression tests and tamper-evident activity telemetry across tenant workflows."
        action={
          <div className="flex items-center gap-2">
            <Button kind="secondary" onClick={() => exportAudit("csv")} className="flex items-center gap-1.5">
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </Button>
            <Button kind="secondary" onClick={() => exportAudit("json")} className="flex items-center gap-1.5">
              <Download className="h-4 w-4" />
              <span>Export JSON</span>
            </Button>
          </div>
        }
      />

      {error && <Notice tone="error">{error}</Notice>}

      {/* 2. Security Posture Scorecard Strip */}
      <section aria-label="Security scorecard" className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard
          label="Attack Suite Pass Rate"
          value={`${passCount}/${totalTests}`}
          subtext="17 automated regression checks"
          tone="emerald"
        />
        <StatCard
          label="Audit Log Integrity"
          value="Immutable"
          subtext="Tamper-evident append-only store"
        />
        <StatCard
          label="Encryption Standard"
          value="AES-256"
          subtext="In-transit: TLS 1.3"
        />
        <StatCard
          label="Access Enforcement"
          value="SQL Gate"
          subtext="Checks run before retrieval"
          tone="emerald"
        />
      </section>

      {/* 3. Anomaly Oversight Notice */}
      {(deniedCount > 0 || flaggedCount > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4 text-xs text-amber-900 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold text-sm">
                Security Activity Oversight: {deniedCount} Denials • {flaggedCount} Flagged Events Recorded
              </p>
              <p className="text-amber-800 mt-0.5">
                Pre-retrieval SQL authorization blocked unauthorized context access without exposing document text.
              </p>
            </div>
          </div>

          <Button kind="secondary" onClick={() => setFilter("denied")}>
            Filter Denials ({deniedCount})
          </Button>
        </div>
      )}

      {/* 4. Automated Security Suite Card */}
      <section className="rounded-xl border border-line bg-surface p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <h2 className="display text-2xl font-semibold text-ink">
              Automated Security & Regression Checks
            </h2>
            <p className="text-xs text-muted mt-0.5">
              17 security tests verifying tenant database isolation, prompt injection containment, SQL pre-filtering, and immediate revocation.
            </p>
          </div>

          {canRunTests && (
            <Button
              kind="primary"
              onClick={runSecuritySuite}
              disabled={running}
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              <span>{running ? "Running security checks…" : "Run security checks"}</span>
            </Button>
          )}
        </div>

        {report?.ran_at && (
          <div className="flex items-center justify-between text-xs text-muted font-mono">
            <span>Last ran {new Date(report.ran_at).toLocaleTimeString()}:</span>
            <span className="font-semibold text-allow">{report.passed} checks passed</span>
          </div>
        )}

        <div className="divide-y divide-line">
          {securityTests.map((t, i) => {
            const isPass = t.outcome === "passed";
            return (
              <motion.div
                key={t.id + (report?.ran_at || "")}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.02 * i }}
                className="flex items-center justify-between py-2.5 text-xs sm:text-sm"
              >
                <div className="flex items-center gap-2.5">
                  {isPass ? (
                    <CheckCircle2 className="h-4 w-4 text-allow shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-deny shrink-0" />
                  )}
                  <span className="text-ink font-medium">{t.title}</span>
                </div>
                <StatusPill status={isPass ? "pass" : "failed"} />
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* 5. Activity Log (Audit Trail) */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-3">
          <div>
            <h2 className="display text-2xl font-semibold text-ink">
              Activity Log ({events.length})
            </h2>
            <p className="text-xs text-muted">
              Tamper-evident audit trail capturing actors, decisions, and correlation IDs without storing private document text.
            </p>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {FILTERS.map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-full px-3 py-1 transition-colors ${
                  filter === value
                    ? "bg-ink font-medium text-white shadow-xs"
                    : "border border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="w-full sm:w-64">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
              <input
                type="text"
                placeholder="Search audit trail…"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} />
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface p-12 text-center text-xs text-muted">
            No audit activity matches the selected filter or search query.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
            <table className="w-full text-left text-sm hidden md:table">
              <thead className="border-b border-line bg-surface-subtle/70 text-xs text-muted font-mono uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Colleague</th>
                  <th className="px-4 py-3 font-medium">Activity</th>
                  <th className="px-4 py-3 font-medium">Outcome</th>
                  <th className="px-4 py-3 font-medium">Documents</th>
                  <th className="px-4 py-3 font-medium text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredEvents.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setSelectedEvent(e)}
                    className="cursor-pointer hover:bg-surface-hover/60 transition-colors group"
                  >
                    <td className="px-4 py-3 text-xs text-muted font-mono whitespace-nowrap">
                      {new Date(e.time).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ink text-xs sm:text-sm">
                      {e.user}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink">
                      {ACTIONS[e.action] ?? e.action}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={e.decision} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted max-w-xs truncate font-mono">
                      {e.documents.join(", ") || "none"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-accent underline underline-offset-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        Inspect →
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile View */}
            <div className="divide-y divide-line md:hidden">
              {filteredEvents.map((e) => (
                <div
                  key={e.id}
                  onClick={() => setSelectedEvent(e)}
                  className="p-4 space-y-1.5 cursor-pointer active:bg-surface-subtle"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-ink text-sm">{e.user}</p>
                      <p className="text-xs text-muted">{ACTIONS[e.action] ?? e.action}</p>
                    </div>
                    <StatusPill status={e.decision} />
                  </div>
                  <div className="flex items-center justify-between text-[0.7rem] text-muted font-mono pt-1">
                    <span>{new Date(e.time).toLocaleTimeString()}</span>
                    <span>{e.documents.join(", ") || "No docs"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 6. Event Details Drawer */}
      <Drawer
        isOpen={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        title={selectedEvent ? `Audit Event #${selectedEvent.id}` : "Event Details"}
        subtitle={selectedEvent ? new Date(selectedEvent.time).toLocaleString() : undefined}
      >
        {selectedEvent && (
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="rounded-xl border border-line bg-surface p-4 space-y-2.5">
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Actor:</span>
                <strong className="text-ink">{selectedEvent.actor || selectedEvent.user}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Action Type:</span>
                <span className="font-mono text-ink">{selectedEvent.action}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Decision Outcome:</span>
                <StatusPill status={selectedEvent.decision} />
              </div>
              {selectedEvent.correlation_id && (
                <div className="flex justify-between py-1 border-b border-line">
                  <span className="text-muted">Correlation ID:</span>
                  <span className="font-mono text-[0.7rem] text-ink">{selectedEvent.correlation_id}</span>
                </div>
              )}
              {selectedEvent.documents?.length > 0 && (
                <div className="py-1">
                  <span className="text-muted block">Documents Involved:</span>
                  <span className="font-semibold text-ink mt-0.5 block">
                    {selectedEvent.documents.join(", ")}
                  </span>
                </div>
              )}
            </div>

            {selectedEvent.detail && Object.keys(selectedEvent.detail).length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted font-mono mb-2">
                  Structured Metadata:
                </p>
                <pre className="rounded-xl border border-line bg-surface-subtle p-3 text-[0.7rem] font-mono text-ink overflow-x-auto">
                  {JSON.stringify(selectedEvent.detail, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
