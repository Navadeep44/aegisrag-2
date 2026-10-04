import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Banded, Level } from "../components/ui/Classification";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { AccessEditor } from "../features/documents/AccessEditor";
import { UploadForm } from "../features/documents/UploadForm";
import { api } from "../lib/api";
import type { Doc, Grant, Role, User } from "../lib/types";

export default function Documents() {
  const admin = Boolean(useAuth().user?.is_admin);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");

  const load = () => api<Doc[]>("/documents").then(setDocs).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    if (admin) {
      api<Role[]>("/roles").then(setRoles).catch(() => {});
      api<User[]>("/users").then(setUsers).catch(() => {});
    }
  }, [admin]);

  // Keep polling while something is still being processed.
  useEffect(() => {
    if (!docs?.some((d) => d.status === "processing")) return;
    const timer = setTimeout(load, 2000);
    return () => clearTimeout(timer);
  }, [docs]);

  async function saveAccess(doc: Doc, grants: Grant[], classification = doc.classification) {
    setError("");
    try {
      await api(`/documents/${doc.id}/access`, {
        method: "PATCH",
        body: JSON.stringify({ classification, grants: grants.map(({ subject_type, subject_id }) => ({ subject_type, subject_id })) }),
      });
      await load();
    } catch (e) { setError((e as Error).message); }
  }

  async function remove(doc: Doc) {
    if (!window.confirm(`Delete "${doc.title}"? This removes the file and everything indexed from it.`)) return;
    try { await api(`/documents/${doc.id}`, { method: "DELETE" }); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="max-w-4xl pb-10">
      <PageHeader title="Documents">
        {admin
          ? "You manage who can read each document. Access changes apply to the next question anyone asks. Managing a document does not let you read it."
          : "These are the documents your questions can draw on."}
      </PageHeader>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {admin && <UploadForm roles={roles} onDone={load} />}
      {docs === null ? <p className="text-sm text-muted">Loading documents…</p>
        : docs.length === 0 ? <Notice tone="info">{admin ? "No documents yet. Upload one above." : "No documents have been shared with you yet."}</Notice>
        : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {docs.map((doc) => (
                <motion.li key={doc.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }}>
                  <Banded level={doc.classification} className="p-5">
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                      <div className="min-w-0 flex-1">
                        <Level level={doc.classification} />
                        <p className="display text-2xl">{doc.title}</p>
                        <p className="text-xs text-muted">{doc.filename}{doc.status !== "active" && `, ${doc.status}`}</p>
                        {doc.note && <p className={`mt-1 text-xs ${doc.flagged || doc.status === "failed" ? "text-warn" : "text-muted"}`}>{doc.note}</p>}
                      </div>
                      {admin && <Button kind="danger" onClick={() => remove(doc)}>Delete</Button>}
                    </div>
                    {admin && doc.access && <AccessEditor doc={doc} roles={roles} users={users} onSave={saveAccess} />}
                  </Banded>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
    </div>
  );
}
