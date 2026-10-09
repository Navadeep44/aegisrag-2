import { useState } from "react";
import { Loader2, Rows3, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";
import type { Doc, Role } from "../../lib/types";

/** Row-level security for structured records: one column decides who sees each row. */
export function RowPolicyEditor({ doc, roles, onSaved }: { doc: Doc; roles: Role[]; onSaved: () => void }) {
  const columns = doc.data_schema?.columns ?? [];
  const [column, setColumn] = useState(doc.row_policy?.column ?? "");
  const [subject, setSubject] = useState(doc.row_policy?.subject_type ?? "department");
  const [full, setFull] = useState<string[]>(doc.row_policy?.full_access_roles ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ restricted_rows: number; unmatched_rows: number }>(`/documents/${doc.id}/row-policy`, {
        method: "PUT",
        body: JSON.stringify({ column: column || null, subject_type: subject, full_access_roles: full }),
      });
      setMsg(column ? `${r.restricted_rows} rows guarded · ${r.unmatched_rows} unmatched (full-access only)` : "Row rule removed");
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><Rows3 className="h-4 w-4 text-emerald-700" /> Row-level rule</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={column} onChange={(e) => setColumn(e.target.value)} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <option value="">No row rule (document access only)</option>
          {columns.map((c) => <option key={c} value={c}>Rows by “{c}”</option>)}
        </select>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!column}
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <option value="department">…matching the reader's department</option>
          <option value="role">…matching the reader's role</option>
        </select>
      </div>
      {column && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-semibold text-muted">See every row</p>
          <div className="flex flex-wrap gap-1.5">
            {roles.map((r) => {
              const on = full.includes(r.name);
              return (
                <button key={r.id} type="button" onClick={() => setFull(on ? full.filter((x) => x !== r.name) : [...full, r.name])}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${
                    on ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted hover:text-ink"}`}>
                  {r.name.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[11px] text-muted"><ShieldCheck className="h-3.5 w-3.5 text-allow" /> Enforced inside the retrieval SQL</p>
        <button onClick={save} disabled={busy} className="btn-primary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Apply
        </button>
      </div>
      {msg && <p className="mt-2 text-xs font-semibold text-accent">{msg}</p>}
    </div>
  );
}
