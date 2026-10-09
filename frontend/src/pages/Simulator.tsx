import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Lock, Play, Rows3, Search, SlidersHorizontal, XCircle } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Notice } from "../components/ui/Notice";
import { ClearancePill } from "../components/ui/StatusPill";
import { api, post } from "../lib/api";
import { LEVELS, type SimResult, type User } from "../lib/types";

const RING = ["from-level-0 to-slate-300", "from-level-1 to-sky-300", "from-level-2 to-amber-300", "from-level-3 to-rose-300"];
const LEVEL_BAR = ["bg-level-0", "bg-level-1", "bg-level-2", "bg-level-3"];
const LEVEL_TEXT = ["text-level-0", "text-level-1", "text-level-2", "text-level-3"];
const PRESETS = ["What was our annual revenue?", "Total approved expense claims", "Salary range for a Senior Engineer", "Engineering roadmap for August"];

export default function Simulator() {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [question, setQuestion] = useState(PRESETS[0]);
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<User[]>("/users").then((list) => {
      setUsers(list);
      const d = list.find((u) => u.email === "employee@acme.test") ?? list.find((u) => !u.is_admin) ?? list[0];
      if (d) setUserId(d.id);
    }).catch((e) => setError(e.message));
  }, []);

  async function run(id = userId, q = question) {
    if (!id || !q.trim()) return;
    setBusy(true);
    setError("");
    try {
      setResult(await post<SimResult>("/policies/simulate", { user_id: id, question: q.trim() }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader icon={SlidersHorizontal} title="Permission simulator" subtitle="See exactly what a person's question can reach — and why." />
      {error && <Notice tone="error">{error}</Notice>}

      {/* People */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {users.map((u) => {
          const active = u.id === userId;
          return (
            <button key={u.id} onClick={() => { setUserId(u.id); run(u.id); }}
              className={`flex shrink-0 items-center gap-2 rounded-2xl border px-2.5 py-2 transition-all ${
                active ? "border-accent bg-accent-light shadow-sm" : "border-line bg-surface hover:border-accent/40"}`}>
              <span className={`grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br p-[2px] ${RING[u.clearance] ?? RING[1]}`}>
                <span className="display grid h-full w-full place-items-center rounded-full bg-surface text-sm text-ink">{u.name[0]}</span>
              </span>
              <span className="text-left">
                <span className="block text-xs font-bold text-ink">{u.name.replace(/\s*\(.*\)/, "")}</span>
                <span className={`block text-[10px] font-semibold ${LEVEL_TEXT[u.clearance]}`}>{(u.roles.find((r) => r !== "employee") ?? u.roles[0])?.replace(/_/g, " ")}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Question */}
      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="glass flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center">
        <Search className="ml-2 hidden h-5 w-5 text-muted sm:block" />
        <input value={question} onChange={(e) => setQuestion(e.target.value)}
          className="flex-1 bg-transparent px-2 py-2 text-sm text-ink focus:outline-none" />
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button type="button" key={p} onClick={() => { setQuestion(p); run(userId, p); }}
              className="chip hover:border-accent/40 hover:text-accent">{p.split(" ").slice(0, 3).join(" ")}…</button>
          ))}
        </div>
        <button className="btn-primary inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run
        </button>
      </form>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div key={result.user.id + question} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-subtle px-4 py-3">
              <span className="display text-lg text-ink">{result.user.name}</span>
              <ClearancePill clearance={result.user.clearance} label={result.user.clearance_label} />
              <span className="chip"><CheckCircle2 className="h-3 w-3 text-allow" /> {result.searchable.length} reachable</span>
              <span className="chip"><XCircle className="h-3 w-3 text-deny" /> {result.excluded.length} blocked in SQL</span>
              <span className="chip"><Search className="h-3 w-3 text-accent" /> {result.matches.length} would match</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Column title="Reachable" tone="allow" rows={result.searchable.map((r) => ({
                ...r, hit: result.matches.some((m) => m.document_id === r.document_id),
              }))} />
              <Column title="Blocked before retrieval" tone="deny" rows={result.excluded.map((r) => ({ ...r, hit: false }))} />
            </div>

            {result.row_access && result.row_access.length > 0 && (
              <section className="glass rounded-2xl p-5">
                <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><Rows3 className="h-4 w-4 text-emerald-700" /> Row-level view</p>
                <div className="space-y-3">
                  {result.row_access.map((r) => {
                    const pct = r.total_rows ? (r.visible_rows / r.total_rows) * 100 : 0;
                    return (
                      <div key={r.document_id}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-semibold text-ink">{r.title}</span>
                          <span className="font-mono text-muted">{r.visible_rows} / {r.total_rows} rows</span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-deny-bg">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full bg-allow" />
                        </div>
                        <p className="mt-1 text-[11px] text-muted">{r.rule}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Column({ title, tone, rows }: {
  title: string; tone: "allow" | "deny";
  rows: { document_id: string; title: string; classification_label: string; reason: string; hit: boolean }[];
}) {
  const Icon = tone === "allow" ? CheckCircle2 : Lock;
  const lvl = (label: string) => Math.max(0, LEVELS.findIndex((l) => l.toLowerCase() === label.toLowerCase()));
  return (
    <section className="glass rounded-2xl p-4">
      <p className={`mb-3 flex items-center gap-2 text-sm font-bold ${tone === "allow" ? "text-allow" : "text-deny"}`}>
        <Icon className="h-4 w-4" /> {title} <span className="text-muted">· {rows.length}</span>
      </p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <motion.div key={r.document_id} initial={{ opacity: 0, x: tone === "allow" ? -8 : 8 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${tone === "allow" ? "border-allow-border bg-allow-bg/50" : "border-deny-border bg-deny-bg/50"}`}>
            <span className={`h-8 w-1 rounded-full ${LEVEL_BAR[lvl(r.classification_label)]}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{r.title}</p>
              <p className="truncate text-[11px] text-muted">{r.reason}</p>
            </div>
            {r.hit && <span className="chip border-accent/30 text-accent"><Search className="h-3 w-3" /> match</span>}
            <span className={`text-[10px] font-bold ${LEVEL_TEXT[lvl(r.classification_label)]}`}>{r.classification_label}</span>
          </motion.div>
        ))}
        {rows.length === 0 && <p className="py-6 text-center text-xs text-muted">None</p>}
      </div>
    </section>
  );
}
