import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Banded, Level } from "../components/ui/Classification";
import { inputClass, smallSelectClass } from "../components/ui/field";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { AccessEditor } from "../features/documents/AccessEditor";
import { UploadForm } from "../features/documents/UploadForm";
import { api, imageUrl, post } from "../lib/api";
import type { Department, Doc, DocStatus, FlaggedDoc, Grant, Role, User } from "../lib/types";
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

  // Flagged Quarantine Drawer / Modal
  const [flaggedDocs, setFlaggedDocs] = useState<FlaggedDoc[]>([]);
  const [reviewingFlagged, setReviewingFlagged] = useState<FlaggedDoc | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  // Delegated Request Modal (for Team Leads, Dept Managers & Admins)
  const [delegatingDoc, setDelegatingDoc] = useState<Doc | null>(null);
  const [delegateTargetUser, setDelegateTargetUser] = useState<string>("");
  const [delegateReason, setDelegateReason] = useState<string>("");
  const [delegateSubmitting, setDelegateSubmitting] = useState(false);

  const canUpload = hasPermission(user, "document.upload");
  const canManageGrants = hasPermission(user, "document.grant.manage");
  const canDelete = hasPermission(user, "document.delete");
  const canManage = canUpload || canManageGrants;
  const isDocManager = user?.roles?.includes("document_manager") || user?.roles?.includes("admin") || user?.is_admin;
  const isDeptLead = user?.roles?.includes("department_manager") || user?.roles?.includes("team_lead") || isDocManager;
  const isHr = user?.roles?.includes("hr");
  const isAuditor = user?.roles?.includes("security_auditor");

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilterTab, setActiveFilterTab] = useState<string>("all");

  const load = () => {
    api<Doc[]>("/documents").then(setDocs).catch((e) => setError(e.message));
    if (isDocManager) {
      api<FlaggedDoc[]>("/documents/flagged").then(setFlaggedDocs).catch(() => {});
    }
  };

  useEffect(() => {
    load();
    if (canManage || isDeptLead) {
      api<Role[]>("/roles").then(setRoles).catch(() => {});
      api<User[]>("/users").then(setUsers).catch(() => {});
      api<Department[]>("/departments").then(setDepartments).catch(() => {});
    }
  }, [canManage, isDeptLead]);

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

  async function handleFlaggedDecision(docId: string, decision: "approve" | "purge") {
    setReviewBusy(true);
    setError("");
    setNotice("");
    try {
      await post(`/documents/${docId}/review-flagged`, {
        decision,
        note: reviewNote.trim() || undefined,
      });
      setNotice(decision === "approve" ? "Document approved and activated." : "Flagged document purged.");
      setReviewingFlagged(null);
      setReviewNote("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReviewBusy(false);
    }
  }

  async function submitDelegatedRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!delegatingDoc || !delegateTargetUser || !delegateReason.trim()) return;
    setDelegateSubmitting(true);
    setError("");
    setNotice("");
    try {
      await post("/access-requests", {
        resource_type: "document",
        resource_id: delegatingDoc.id,
        target_user_id: delegateTargetUser,
        reason: delegateReason.trim(),
      });
      setNotice(`Delegated access request submitted for teammate.`);
      setDelegatingDoc(null);
      setDelegateTargetUser("");
      setDelegateReason("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDelegateSubmitting(false);
    }
  }

  const filteredDocs = (docs || []).filter((d) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!d.title.toLowerCase().includes(q) && !d.filename.toLowerCase().includes(q)) return false;
    }
    if (activeFilterTab === "active") return d.status === "active";
    if (activeFilterTab === "processing") return d.status === "processing";
    if (activeFilterTab === "flagged") return d.flagged || d.status === "flagged";
    if (activeFilterTab === "hr") return d.classification === 3 || d.title.toLowerCase().includes("leave") || d.title.toLowerCase().includes("salary");
    if (activeFilterTab === "dept") return d.readable;
    return true;
  });

  const activeCount = (docs || []).filter((d) => d.status === "active").length;
  const processingCount = (docs || []).filter((d) => d.status === "processing").length;
  const flaggedCount = (docs || []).filter((d) => d.flagged || d.status === "flagged").length;

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader title={isDocManager ? "Document Ingestion & Knowledge Hub" : isAuditor ? "Document Catalog Metadata (Audit View)" : "Documents Catalog"}>
          {isDocManager
            ? "Manage lifecycle, classification tiers, pre-indexing grants, and multimodal ingestion pipeline jobs. Access changes apply to subsequent queries immediately."
            : isAuditor
            ? "Inspect tamper-proof checksums, document classifications, multimodal extraction formats, and indirect prompt injection flags."
            : "Authorized enterprise documents your questions can draw upon according to your role grants and clearance level."}
        </PageHeader>
        {!canManage && (
          <a href="/app/access-requests" className="text-xs text-accent underline underline-offset-4 hover:opacity-80 font-medium">
            Request Additional Document Access →
          </a>
        )}
      </div>

      {/* Operations metrics banner for Document Managers & Admins */}
      {isDocManager && docs && (
        <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <p className="text-xs uppercase tracking-wide text-muted font-mono">Total Ingested</p>
            <p className="display mt-1 text-3xl font-semibold text-ink">{docs.length}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <p className="text-xs uppercase tracking-wide text-muted font-mono">Active in Vector DB</p>
            <p className="display mt-1 text-3xl font-semibold text-emerald-700">{activeCount}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <p className="text-xs uppercase tracking-wide text-muted font-mono">Processing Queue</p>
            <p className="display mt-1 text-3xl font-semibold text-sky-700">{processingCount}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <p className="text-xs uppercase tracking-wide text-muted font-mono">Flagged Injections</p>
            <div className="mt-1 flex items-baseline justify-between">
              <p className="display text-3xl font-semibold text-amber-700">{flaggedDocs.length || flaggedCount}</p>
              {flaggedDocs.length > 0 && (
                <button
                  onClick={() => setReviewingFlagged(flaggedDocs[0])}
                  className="text-xs text-amber-700 underline underline-offset-2 font-medium"
                >
                  Review Quarantine →
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="info">{notice}</Notice>}

      {canUpload && <UploadForm roles={roles} departments={departments} onDone={load} />}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex flex-wrap gap-1 text-xs">
          <button
            onClick={() => setActiveFilterTab("all")}
            className={`rounded-full px-3 py-1 transition-colors ${activeFilterTab === "all" ? "bg-ink font-medium text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}
          >
            All ({docs?.length ?? 0})
          </button>
          {isDocManager && (
            <>
              <button
                onClick={() => setActiveFilterTab("active")}
                className={`rounded-full px-3 py-1 transition-colors ${activeFilterTab === "active" ? "bg-ink font-medium text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}
              >
                Active ({activeCount})
              </button>
              <button
                onClick={() => setActiveFilterTab("processing")}
                className={`rounded-full px-3 py-1 transition-colors ${activeFilterTab === "processing" ? "bg-ink font-medium text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}
              >
                Processing ({processingCount})
              </button>
              <button
                onClick={() => setActiveFilterTab("flagged")}
                className={`rounded-full px-3 py-1 transition-colors ${activeFilterTab === "flagged" ? "bg-amber-700 font-medium text-white" : "border border-line bg-surface text-muted hover:text-amber-700"}`}
              >
                Flagged Injections ({flaggedDocs.length || flaggedCount})
              </button>
            </>
          )}
          {isHr && (
            <button
              onClick={() => setActiveFilterTab("hr")}
              className={`rounded-full px-3 py-1 transition-colors ${activeFilterTab === "hr" ? "bg-ink font-medium text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}
            >
              HR & Policies
            </button>
          )}
          {isDeptLead && (
            <button
              onClick={() => setActiveFilterTab("dept")}
              className={`rounded-full px-3 py-1 transition-colors ${activeFilterTab === "dept" ? "bg-ink font-medium text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}
            >
              My Department
            </button>
          )}
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            placeholder="Filter documents by title…"
            className="w-full rounded-md border border-line bg-surface px-3 py-1 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {docs === null ? (
        <p className="text-sm text-muted">Loading catalog…</p>
      ) : filteredDocs.length === 0 ? (
        <Notice tone="info">
          {searchQuery ? "No documents match your search query." : canManage ? "No documents match the selected filter." : "No documents have been authorized for your profile."}
        </Notice>
      ) : (
        <ul className="space-y-4">
          <AnimatePresence initial={false}>
            {filteredDocs.map((doc) => (
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
                      {/* Delegated access request button for Team Leads & Dept Managers */}
                      {isDeptLead && users.length > 0 && (
                        <Button kind="secondary" onClick={() => setDelegatingDoc(doc)}>
                          Request for Teammate
                        </Button>
                      )}
                      {doc.flagged && isDocManager && (
                        <Button
                          kind="primary"
                          onClick={() => {
                            const found = flaggedDocs.find((f) => f.id === doc.id);
                            setReviewingFlagged(found || {
                              id: doc.id,
                              title: doc.title,
                              filename: doc.filename,
                              classification: doc.classification,
                              status: doc.status,
                              note: doc.note,
                              created_at: "",
                              sample_chunks: [],
                            });
                          }}
                        >
                          Review Flagged
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

      {/* Flagged Document Quarantine Review Modal */}
      {reviewingFlagged && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-line bg-surface p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-line pb-3">
              <div>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  Quarantine Review
                </span>
                <h3 className="display text-2xl mt-1 text-ink">{reviewingFlagged.title}</h3>
                <p className="text-xs text-muted font-mono">{reviewingFlagged.filename}</p>
              </div>
              <Button kind="secondary" onClick={() => setReviewingFlagged(null)} disabled={reviewBusy}>
                Close
              </Button>
            </div>

            <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-4 text-xs space-y-1">
              <p className="font-semibold text-amber-900">Ingestion Sanitizer Flag Reasoning:</p>
              <p className="text-amber-800">{reviewingFlagged.note || "Indirect prompt injection pattern detected during ingestion extraction."}</p>
            </div>

            {reviewingFlagged.sample_chunks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted font-mono">Sample Extracted Chunk Excerpts:</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {reviewingFlagged.sample_chunks.map((chunk, idx) => (
                    <div key={idx} className="rounded-md border border-line bg-bg p-3 text-xs font-mono text-muted">
                      <span className="font-semibold text-ink">Page {chunk.page}: </span>
                      {chunk.text}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Auditor / Review Note (Optional):</label>
              <input
                className={inputClass}
                placeholder="e.g. Verified harmless sample document text, confirmed safe for indexing."
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                disabled={reviewBusy}
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <Button
                kind="danger"
                onClick={() => handleFlaggedDecision(reviewingFlagged.id, "purge")}
                disabled={reviewBusy}
              >
                Purge & Delete File
              </Button>
              <Button
                kind="primary"
                onClick={() => handleFlaggedDecision(reviewingFlagged.id, "approve")}
                disabled={reviewBusy}
              >
                {reviewBusy ? "Saving..." : "✓ Approve & Activate in Vector DB"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delegated Access Request Modal */}
      {delegatingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl space-y-4">
            <h3 className="display text-xl font-semibold text-ink">Request Access for Team Member</h3>
            <p className="text-xs text-muted">
              Submit a delegated grant request for <strong className="text-ink">{delegatingDoc.title}</strong> on behalf of a teammate.
            </p>

            <form onSubmit={submitDelegatedRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Select Teammate *</label>
                <select
                  className={inputClass}
                  value={delegateTargetUser}
                  onChange={(e) => setDelegateTargetUser(e.target.value)}
                  required
                >
                  <option value="">Choose a team member...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.roles.join(", ")} • Clearance L{u.clearance})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">Business Justification *</label>
                <textarea
                  className={`${inputClass} min-h-[90px]`}
                  placeholder="Explain why this team member requires access to this document for their project assignment..."
                  value={delegateReason}
                  onChange={(e) => setDelegateReason(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  kind="secondary"
                  onClick={() => { setDelegatingDoc(null); setDelegateTargetUser(""); setDelegateReason(""); }}
                  disabled={delegateSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={delegateSubmitting || !delegateTargetUser || !delegateReason.trim()}>
                  {delegateSubmitting ? "Submitting..." : "Submit Delegated Request"}
                </Button>
              </div>
            </form>
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
                <span className="font-mono">{jobStatus.document_id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Status:</span>
                <span className="font-semibold">{jobStatus.status}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Pipeline Stage:</span>
                <span className="font-semibold capitalize text-accent">{jobStatus.stage}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Page Count:</span>
                <span>{jobStatus.page_count}</span>
              </div>
              {jobStatus.checksum && (
                <div className="flex justify-between py-1 border-b border-line">
                  <span className="text-muted">Checksum:</span>
                  <span className="font-mono text-[0.7rem]">{jobStatus.checksum.slice(0, 16)}…</span>
                </div>
              )}
              {jobStatus.note && (
                <div className="py-1">
                  <span className="text-muted">Note:</span>
                  <p className="mt-0.5 text-ink font-medium">{jobStatus.note}</p>
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
