import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Banded, Level } from "../components/ui/Classification";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { AccessEditor } from "../features/documents/AccessEditor";
import { UploadForm } from "../features/documents/UploadForm";
import { api, imageUrl, post } from "../lib/api";
import type { Department, Doc, DocStatus, Grant, Role, User } from "../lib/types";
import { hasPermission } from "../lib/types";

export default function Documents() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Preview modal
  const [previewDoc, setPreviewDoc] = useState<Doc | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewImgUrl, setPreviewImgUrl] = useState<string | null>(null);

  // Ingestion job status modal
  const [jobStatus, setJobStatus] = useState<DocStatus | null>(null);

  const canUpload = hasPermission(user, "document.upload");
  const canManageGrants = hasPermission(user, "document.grant.manage");
  const canDelete = hasPermission(user, "document.delete");
  const canManage = canUpload || canManageGrants;

  const load = () => api<Doc[]>("/documents").then(setDocs).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    if (canManage) {
      api<Role[]>("/roles").then(setRoles).catch(() => {});
      api<User[]>("/users").then(setUsers).catch(() => {});
      api<Department[]>("/departments").then(setDepartments).catch(() => {});
    }
  }, [canManage]);

  // Keep polling while something is still being processed.
  useEffect(() => {
    if (!docs?.some((d) => d.status === "processing")) return;
    const timer = setTimeout(load, 2000);
    return () => clearTimeout(timer);
  }, [docs]);

  useEffect(() => {
    if (!previewDoc) {
      setPreviewImgUrl(null);
      return;
    }
    imageUrl(`/documents/${previewDoc.id}/pages/${previewPage}`).then(setPreviewImgUrl);
  }, [previewDoc, previewPage]);

  async function saveAccess(doc: Doc, grants: Grant[], classification = doc.classification) {
    setError(""); setNotice("");
    try {
      await api(`/documents/${doc.id}/access`, {
        method: "PATCH",
        body: JSON.stringify({
          classification,
          grants: grants.map(({ subject_type, subject_id, expires_at }) => ({
            subject_type,
            subject_id,
            expires_at: expires_at || null,
          })),
        }),
      });
      setNotice(`Access grants updated for "${doc.title}".`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(doc: Doc) {
    if (!window.confirm(`Delete "${doc.title}"? This removes the file and everything indexed from it.`)) return;
    try {
      await api(`/documents/${doc.id}`, { method: "DELETE" });
      setNotice(`Document "${doc.title}" purged from catalog.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reprocess(doc: Doc) {
    setError(""); setNotice("");
    try {
      await post(`/documents/${doc.id}/reprocess`, {});
      setNotice(`Reprocessing started for "${doc.title}".`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function inspectJob(doc: Doc) {
    try {
      const status = await api<DocStatus>(`/documents/${doc.id}/status`);
      setJobStatus(status);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="max-w-4xl space-y-8 pb-12">
      <PageHeader title="Documents Catalog">
        {canManage
          ? "Manage lifecycle, classification, pre-indexing grants, and processing jobs. Access changes apply to subsequent queries immediately."
          : "These are the authorized documents your questions can draw upon according to your role grants and clearance."}
      </PageHeader>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="info">{notice}</Notice>}

      {canUpload && <UploadForm roles={roles} departments={departments} onDone={load} />}

      {docs === null ? (
        <p className="text-sm text-muted">Loading catalog…</p>
      ) : docs.length === 0 ? (
        <Notice tone="info">
          {canManage ? "No documents in organization. Upload a document above." : "No documents have been authorized for your profile."}
        </Notice>
      ) : (
        <ul className="space-y-4">
          <AnimatePresence initial={false}>
            {docs.map((doc) => (
              <motion.li
                key={doc.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Banded level={doc.classification} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Level level={doc.classification} />
                        <span className="rounded bg-line px-1.5 py-0.5 text-[0.7rem] uppercase font-mono text-muted">
                          {doc.kind}
                        </span>
                        <span className="rounded bg-line px-1.5 py-0.5 text-[0.7rem] font-mono text-muted">
                          v{doc.version || 1}
                        </span>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${
                          doc.status === "active" ? "bg-emerald-100 text-emerald-800" :
                          doc.status === "failed" ? "bg-rose-100 text-rose-800" :
                          doc.status === "flagged" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"
                        }`}>
                          {doc.status}
                        </span>
                      </div>

                      <p className="display mt-1 text-2xl font-semibold text-ink">{doc.title}</p>
                      <p className="text-xs text-muted font-mono">
                        {doc.filename} • {doc.page_count} page(s)
                        {doc.checksum && ` • SHA: ${doc.checksum.slice(0, 10)}…`}
                      </p>

                      {doc.note && (
                        <p className={`mt-1 text-xs ${doc.flagged || doc.status === "failed" ? "text-warn font-medium" : "text-muted"}`}>
                          {doc.note}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {doc.readable && doc.page_count > 0 && (
                        <Button kind="secondary" onClick={() => { setPreviewDoc(doc); setPreviewPage(1); }}>
                          Page Preview
                        </Button>
                      )}
                      {canManage && (
                        <Button kind="secondary" onClick={() => inspectJob(doc)}>
                          Job Status
                        </Button>
                      )}
                      {canManage && (
                        <Button kind="secondary" onClick={() => reprocess(doc)}>
                          Reprocess
                        </Button>
                      )}
                      {canDelete && (
                        <Button kind="danger" onClick={() => remove(doc)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>

                  {canManageGrants && doc.access && (
                    <div className="mt-4 pt-3 border-t border-line/60">
                      <AccessEditor doc={doc} roles={roles} users={users} departments={departments} onSave={saveAccess} />
                    </div>
                  )}
                </Banded>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* Page Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-line bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-line pb-3">
              <div>
                <h3 className="display text-2xl">{previewDoc.title}</h3>
                <p className="text-xs text-muted">Page {previewPage} of {previewDoc.page_count}</p>
              </div>
              <Button kind="secondary" onClick={() => setPreviewDoc(null)}>Close</Button>
            </div>

            <div className="my-4 flex items-center justify-center min-h-[300px] rounded-lg border border-line bg-surface p-2">
              {previewImgUrl ? (
                <img src={previewImgUrl} alt={`Page ${previewPage}`} className="max-h-[60vh] object-contain rounded shadow-sm" />
              ) : (
                <p className="text-xs text-muted">No preview image available for this page.</p>
              )}
            </div>

            {previewDoc.page_count > 1 && (
              <div className="flex items-center justify-between pt-2">
                <Button
                  kind="secondary"
                  disabled={previewPage <= 1}
                  onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                >
                  Previous Page
                </Button>
                <span className="text-xs font-mono text-muted">Page {previewPage} / {previewDoc.page_count}</span>
                <Button
                  kind="secondary"
                  disabled={previewPage >= previewDoc.page_count}
                  onClick={() => setPreviewPage((p) => Math.min(previewDoc.page_count, p + 1))}
                >
                  Next Page
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Job Status Modal */}
      {jobStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-xl">
            <h3 className="display text-2xl">Ingestion Job Status</h3>
            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Document ID:</span>
                <span className="font-mono text-ink">{jobStatus.document_id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Job Status:</span>
                <span className="font-semibold uppercase text-ink">{jobStatus.job_status}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Current Stage:</span>
                <span className="font-mono text-ink">{jobStatus.stage}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Version:</span>
                <span className="font-mono text-ink">v{jobStatus.version}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Page Count:</span>
                <span className="font-mono text-ink">{jobStatus.page_count}</span>
              </div>
              {jobStatus.checksum && (
                <div className="py-1 border-b border-line">
                  <span className="text-muted block">Checksum (SHA-256):</span>
                  <span className="font-mono text-[0.65rem] break-all text-ink">{jobStatus.checksum}</span>
                </div>
              )}
              {jobStatus.note && (
                <div className="py-1">
                  <span className="text-muted block">Note:</span>
                  <span className="text-ink">{jobStatus.note}</span>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <Button kind="secondary" onClick={() => setJobStatus(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
