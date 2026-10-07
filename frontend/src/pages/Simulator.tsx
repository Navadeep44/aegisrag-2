import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  SlidersHorizontal,
  CheckCircle2,
  Lock,
  Search,
  Sparkles,
  HelpCircle,
  FileText,
  User as UserIcon,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import { EmptyState } from "../components/ui/EmptyState";
import { ClearancePill, RolePill } from "../components/ui/StatusPill";
import { api, post } from "../lib/api";
import type { SimResult, SimRow, User } from "../lib/types";

export default function Simulator() {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [question, setQuestion] = useState("What was our annual revenue in FY2025?");
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<User[]>("/users")
      .then((list) => {
        setUsers(list);
        const defaultUser = list.find((u) => !u.is_admin) ?? list[0];
        if (defaultUser) setUserId(defaultUser.id);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function runSimulation(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!userId || !question.trim() || busy) return;

    setBusy(true);
    setError("");
    try {
      const res = await post<SimResult>("/policies/simulate", {
        user_id: userId,
        question: question.trim(),
      });
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selectedUserObj = users.find((u) => u.id === userId);

  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        title="Check what someone can see"
        subtitle="Simulate which documents a colleague's question can draw upon before retrieval, and inspect the exact authorization reason."
      />

      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr] items-start">
        {/* Left Column: Input Form & Person Picker */}
        <section className="rounded-xl border border-line bg-surface p-6 shadow-xs space-y-5">
          <div>
            <h2 className="display text-2xl font-semibold text-ink">1. Choose person & question</h2>
            <p className="text-xs text-muted mt-0.5">
              Select any colleague profile to test against SQL authorization clauses.
            </p>
          </div>

          <form onSubmit={runSimulation} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1.5">Select Colleague</label>
              <select
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.roles.join(", ")} • Clearance L{u.clearance})
                  </option>
                ))}
              </select>
            </div>

            {selectedUserObj && (
              <div className="rounded-lg border border-line bg-surface-subtle p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Clearance Level:</span>
                  <ClearancePill
                    clearance={selectedUserObj.clearance}
                    label={selectedUserObj.clearance_label}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Roles:</span>
                  <span className="text-ink font-mono font-medium">
                    {selectedUserObj.roles.join(", ")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Department:</span>
                  <span className="text-ink">{selectedUserObj.department_name || "General"}</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-ink mb-1.5">Test Question</label>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-line bg-surface p-3 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Type a question to test authorization boundaries..."
              />
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={busy || !userId || !question.trim()} className="w-full">
                {busy ? "Running policy simulation…" : "Check access"}
              </Button>
            </div>
          </form>

          <div className="border-t border-line pt-4">
            <p className="text-[0.7rem] font-bold uppercase tracking-wider text-muted font-mono mb-2">
              Try sample scenarios:
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setQuestion("What was our annual revenue in FY2025?");
                  const emp = users.find((u) => u.email === "employee@acme.test") || users[0];
                  if (emp) setUserId(emp.id);
                }}
                className="w-full text-left rounded-lg border border-line bg-surface-subtle p-2.5 text-xs text-ink hover:border-ink/60 transition-colors"
              >
                <span className="font-semibold block">Employee asks about FY2025 Revenue</span>
                <span className="text-[0.7rem] text-muted">Tests Level 2 Confidential boundary check</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setQuestion("What is the salary band for Level 4 Engineers?");
                  const eng = users.find((u) => u.email === "engineer@acme.test") || users[0];
                  if (eng) setUserId(eng.id);
                }}
                className="w-full text-left rounded-lg border border-line bg-surface-subtle p-2.5 text-xs text-ink hover:border-ink/60 transition-colors"
              >
                <span className="font-semibold block">Engineer asks about Salary Bands 2026</span>
                <span className="text-[0.7rem] text-muted">Tests Level 3 Restricted HR vault isolation</span>
              </button>
            </div>
          </div>
        </section>

        {/* Right Column: Simulation Results */}
        <section className="space-y-6">
          {!result && !busy && (
            <EmptyState
              icon={SlidersHorizontal}
              title="No simulation run yet"
              description="Choose a person and question on the left to see which documents they can search and why other documents are blocked."
              actionText="Try an example"
              onAction={() => runSimulation()}
            />
          )}

          {busy && (
            <div className="rounded-xl border border-line bg-surface p-12 text-center text-xs text-muted space-y-3">
              <span className="inline-block h-3 w-3 rounded-full bg-accent animate-ping" />
              <p>Simulating SQL-level pre-retrieval authorization clauses…</p>
            </div>
          )}

          {result && !busy && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {/* Summary Card */}
              <div className="rounded-xl border border-line bg-surface p-5 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="display text-xl font-semibold text-ink">
                    Simulation result for {result.user.name}
                  </h3>
                  <ClearancePill
                    clearance={result.user.clearance}
                    label={result.user.clearance_label}
                  />
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  When asking <em>"{question}"</em>, SQL pre-inference filters allow searching{" "}
                  <strong className="text-allow">{result.searchable.length} documents</strong> and exclude{" "}
                  <strong className="text-deny">{result.excluded.length} documents</strong>.
                </p>
              </div>

              {/* Allowed Documents List */}
              <div className="rounded-xl border border-allow-border bg-allow-bg/30 p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 text-allow font-semibold text-sm">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Can be searched ({result.searchable.length})</span>
                </div>

                {result.searchable.length === 0 ? (
                  <p className="text-xs text-muted">
                    No documents authorized. The colleague will be told there is no authorized source.
                  </p>
                ) : (
                  <ul className="divide-y divide-allow-border/60">
                    {result.searchable.map((r, i) => (
                      <motion.li
                        key={r.document_id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 * i }}
                        className="py-2.5 text-xs first:pt-0 last:pb-0"
                      >
                        <div className="flex items-baseline justify-between">
                          <p className="font-semibold text-ink text-sm">{r.title}</p>
                          <span className="font-mono text-[0.7rem] text-muted">
                            {r.classification_label}
                          </span>
                        </div>
                        <p className="text-muted mt-0.5">{r.reason}</p>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Excluded Documents List */}
              <div className="rounded-xl border border-deny-border bg-deny-bg/30 p-5 shadow-xs space-y-3">
                <div className="flex items-center gap-2 text-deny font-semibold text-sm">
                  <Lock className="h-5 w-5" />
                  <span>Excluded before search ({result.excluded.length})</span>
                </div>

                {result.excluded.length === 0 ? (
                  <p className="text-xs text-muted">Nothing was excluded.</p>
                ) : (
                  <ul className="divide-y divide-deny-border/60">
                    {result.excluded.map((r, i) => (
                      <motion.li
                        key={r.document_id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 * i }}
                        className="py-2.5 text-xs first:pt-0 last:pb-0"
                      >
                        <div className="flex items-baseline justify-between">
                          <p className="font-semibold text-ink text-sm">{r.title}</p>
                          <span className="font-mono text-[0.7rem] text-muted">
                            {r.classification_label}
                          </span>
                        </div>
                        <p className="text-deny/90 font-medium mt-0.5">{r.reason}</p>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          )}
        </section>
      </div>
    </div>
  );
}
