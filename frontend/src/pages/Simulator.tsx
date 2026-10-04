import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { inputClass } from "../components/ui/field";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { api, post } from "../lib/api";
import type { SimResult, SimRow, User } from "../lib/types";

export default function Simulator() {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [question, setQuestion] = useState("What was our annual revenue?");
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<User[]>("/users")
      .then((list) => { setUsers(list); setUserId(list.find((u) => !u.is_admin)?.id ?? list[0]?.id ?? ""); })
      .catch((e) => setError(e.message));
  }, []);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { setResult(await post<SimResult>("/policies/simulate", { user_id: userId, question })); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-4xl pb-10">
      <PageHeader title="Permission simulator">
        See which documents a person's question could draw on, and why the others are excluded. Only titles and reasons are shown, never document content.
      </PageHeader>
      <form onSubmit={run} className="mb-8 grid gap-3 sm:grid-cols-[14rem_1fr_auto]">
        <select className={inputClass} aria-label="Person" value={userId} onChange={(e) => setUserId(e.target.value)}>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input className={inputClass} aria-label="Question" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <Button type="submit" disabled={busy || !userId || !question.trim()}>Simulate</Button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
      {result && (
        <motion.div key={result.user.id + question} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-8">
          <p>
            <span className="font-medium">{result.user.name}</span> has roles {result.user.roles.join(", ")} and {result.user.clearance_label} clearance.
          </p>
          <section>
            <h2 className="display text-2xl">Would be retrieved for this question</h2>
            {result.matches.length === 0
              ? <p className="mt-1 text-muted">Nothing. The person would be told there is no authorized source.</p>
              : <ul className="mt-2 space-y-1">{result.matches.map((m) => <li key={m.document_id}>{m.title}, page {m.page}</li>)}</ul>}
          </section>
          <div className="grid gap-8 md:grid-cols-2">
            <DocumentList title="Can be searched" rows={result.searchable} tone="text-allow" empty="No documents." />
            <DocumentList title="Excluded before search" rows={result.excluded} tone="text-deny" empty="Nothing is excluded." />
          </div>
        </motion.div>
      )}
    </div>
  );
}

function DocumentList({ title, rows, tone, empty }: { title: string; rows: SimRow[]; tone: string; empty: string }) {
  return (
    <section>
      <h2 className={`display text-2xl ${tone}`}>{title} ({rows.length})</h2>
      {rows.length === 0 ? <p className="mt-1 text-sm text-muted">{empty}</p> : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <li key={r.document_id} className="py-3 text-sm">
              <p className="font-medium">{r.title} <span className="font-normal text-muted">({r.classification_label})</span></p>
              <p className="text-muted">{r.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
