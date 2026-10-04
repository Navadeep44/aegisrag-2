import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { api } from "../lib/api";
import type { AuditEvent, TestReport } from "../lib/types";

const ACTIONS: Record<string, string> = {
  "chat.query": "Asked a question",
  "document.read": "Tried to open a document",
  "document.upload": "Uploaded a document",
  "document.delete": "Deleted a document",
  "document.access_change": "Changed document access",
  "ingest.injection_flag": "Suspicious instructions found in an upload",
  "policy.simulate": "Ran the permission simulator",
};
const FILTERS = [["", "All"], ["abstained", "No authorized source"], ["denied", "Denied"], ["flagged", "Flagged"]];
const tone = (decision: string) =>
  ["denied", "flagged", "failed"].includes(decision) ? "text-deny" : decision === "abstained" ? "text-warn" : "text-allow";

export default function Security() {
  const [report, setReport] = useState<TestReport | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { api<TestReport>("/security/tests").then(setReport).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    api<AuditEvent[]>(`/audit/events${filter ? `?decision=${filter}` : ""}`).then(setEvents).catch((e) => setError(e.message));
  }, [filter]);

  async function run() {
    setRunning(true); setError("");
    try { setReport(await api<TestReport>("/security/tests/run", { method: "POST" })); }
    catch (e) { setError((e as Error).message); }
    finally { setRunning(false); }
  }

  const security = report?.tests.filter((t) => t.group === "security") ?? [];
  const other = report?.tests.filter((t) => t.group !== "security") ?? [];

  return (
    <div className="max-w-4xl space-y-14 pb-10">
      <section>
        <PageHeader title="Security">
          Attack and access tests run against a separate test database with its own copy of the demo data. Results below are from the last real run.
        </PageHeader>
        {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Button onClick={run} disabled={running}>{running ? "Running tests…" : "Run tests"}</Button>
          {report?.ran_at && (
            <p className="text-sm text-muted">
              Last run {new Date(report.ran_at).toLocaleString()}: <span className="text-allow">{report.passed} passed</span>
              {report.failed ? <>, <span className="text-deny">{report.failed} failed</span></> : null}
            </p>
          )}
        </div>
        {!report?.ran_at ? <Notice tone="info">No test run yet. Run the tests to see results.</Notice> : (
          <>
            <ul className="divide-y divide-line border-y border-line">
              {security.map((t, i) => (
                <motion.li key={t.id + report.ran_at} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03, duration: 0.3 }}
                  className="flex items-baseline gap-4 py-2.5 text-sm">
                  <span className={`w-12 shrink-0 font-semibold ${tone(t.outcome === "passed" ? "allowed" : "failed")}`}>{t.outcome === "passed" ? "Pass" : "Fail"}</span>
                  <span>{t.title}</span>
                </motion.li>
              ))}
            </ul>
            {other.length > 0 && <p className="mt-2 text-xs text-muted">Plus {other.filter((t) => t.outcome === "passed").length} of {other.length} unit tests passed.</p>}
          </>
        )}
      </section>

      <section>
        <h2 className="display text-3xl">Activity log</h2>
        <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-muted">Records who did what and which documents were involved. Questions and document text are not stored here.</p>
        <div className="my-4 flex flex-wrap gap-2" role="group" aria-label="Filter activity">
          {FILTERS.map(([value, label]) => (
            <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${filter === value ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink"}`}>{label}</button>
          ))}
        </div>
        {events.length === 0 ? <Notice tone="info">No activity matches this filter.</Notice> : (
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-muted"><tr>
                <th className="px-4 py-2.5 font-medium">Time</th><th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-4 py-2.5 font-medium">Activity</th><th className="px-4 py-2.5 font-medium">Outcome</th>
                <th className="px-4 py-2.5 font-medium">Documents involved</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">{new Date(e.time).toLocaleTimeString()}</td>
                    <td className="px-4 py-2.5">{e.user}</td>
                    <td className="px-4 py-2.5">{ACTIONS[e.action] ?? e.action}</td>
                    <td className={`px-4 py-2.5 font-medium ${tone(e.decision)}`}>{e.decision === "abstained" ? "no authorized source" : e.decision}</td>
                    <td className="px-4 py-2.5 text-muted">{e.documents.join(", ") || "none"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
