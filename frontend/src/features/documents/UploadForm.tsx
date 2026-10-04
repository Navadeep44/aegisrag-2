import { useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { inputClass } from "../../components/ui/field";
import { Notice } from "../../components/ui/Notice";
import { api } from "../../lib/api";
import { LEVELS, type Role } from "../../lib/types";

export function UploadForm({ roles, onDone }: { roles: Role[]; onDone: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [classification, setClassification] = useState(1);
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const chosen = file.current?.files?.[0];
    if (!chosen) { setError("Choose a file to upload."); return; }
    const grants = roleId === "*" ? [{ subject_type: "everyone" }] : roleId ? [{ subject_type: "role", subject_id: roleId }] : [];
    const form = new FormData();
    form.append("file", chosen);
    form.append("title", title);
    form.append("classification", String(classification));
    form.append("grants", JSON.stringify(grants));
    setBusy(true); setError("");
    try {
      await api("/documents/upload", { method: "POST", body: form });
      setTitle("");
      if (file.current) file.current.value = "";
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={upload} className="mb-8 rounded-md border border-line bg-surface p-5">
      <h2 className="display text-2xl">Upload a document</h2>
      <p className="mt-1 text-sm text-muted">PDF, PNG, JPG, XLSX, TXT or MD. Nobody can read a new document until you grant access.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input ref={file} type="file" aria-label="File" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.txt,.md" className="self-center text-sm" />
        <input className={inputClass} placeholder="Title (optional)" aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className={inputClass} aria-label="Classification" value={classification} onChange={(e) => setClassification(Number(e.target.value))}>
          {LEVELS.map((label, i) => <option key={label} value={i}>{label}</option>)}
        </select>
        <select className={inputClass} aria-label="Initial access" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">No access yet</option>
          <option value="*">Everyone</option>
          {roles.map((r) => <option key={r.id} value={r.id}>Role: {r.name}</option>)}
        </select>
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <Button type="submit" disabled={busy} className="mt-4">{busy ? "Uploading…" : "Upload document"}</Button>
    </form>
  );
}
