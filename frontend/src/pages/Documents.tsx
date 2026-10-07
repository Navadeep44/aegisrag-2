import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  Upload,
  Search,
  FileText,
  Shield,
  Eye,
  RefreshCw,
  Trash2,
  AlertTriangle,
  FileCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  UserPlus,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { StatCard } from "../components/ui/StatCard";
import { StatCardSkeleton, TableSkeleton } from "../components/ui/Skeleton";
import { Notice } from "../components/ui/Notice";
import { Drawer } from "../components/ui/Drawer";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ClearancePill, StatusPill } from "../components/ui/StatusPill";
import { AccessEditor } from "../features/documents/AccessEditor";
import { UploadForm } from "../features/documents/UploadForm";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ui/Toast";
import { api, imageUrl, post } from "../lib/api";
import type { Department, Doc, DocStatus, FlaggedDoc, Grant, Role, User } from "../lib/types";
import { hasPermission } from "../lib/types";

export default function Documents() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilterTab, setActiveFilterTab] = useState<string>("all");

  // Drawers & Modals
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [docDrawerTab, setDocDrawerTab] = useState<"access" | "pages" | "processing" | "danger">("access");

  // Preview state inside drawer
  const [previewPage, setPreviewPage] = useState(1);
  const [previewImgUrl, setPreviewImgUrl] = useState<string | null>(null);
  const [previewImgLoading, setPreviewImgLoading] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);

  // Ingestion job status
  const [jobStatus, setJobStatus] = useState<DocStatus | null>(null);
  const [jobLoading, setJobLoading] = useState(false);

  // Flagged Quarantine Drawer
  const [flaggedDocs, setFlaggedDocs] = useState<FlaggedDoc[]>([]);
  const [reviewingFlagged, setReviewingFlagged] = useState<FlaggedDoc | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  // Delegated Access Request Modal
  const [delegatingDoc, setDelegatingDoc] = useState<Doc | null>(null);
  const [delegateTargetUser, setDelegateTargetUser] = useState<string>("");
  const [delegateReason, setDelegateReason] = useState<string>("");
  const [delegateSubmitting, setDelegateSubmitting] = useState(false);

  // Delete Confirmation Dialog
  const [deletingDoc, setDeletingDoc] = useState<Doc | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canUpload = hasPermission(user, "document.upload");
  const canManageGrants = hasPermission(user, "document.grant.manage");
  const canDelete = hasPermission(user, "document.delete");
  const canManage = canUpload || canManageGrants;
  const isDocManager =
    user?.roles?.includes("document_manager") ||
    user?.roles?.includes("admin") ||
    user?.is_admin;
  const isDeptLead =
    user?.roles?.includes("department_manager") ||
    user?.roles?.includes("team_lead") ||
    isDocManager;
  const isHr = user?.roles?.includes("hr");
  const isAuditor = user?.roles?.includes("security_auditor");

  const load = () => {
    api<Doc[]>("/documents")
      .then(setDocs)
      .catch((e) => setError((e as Error).message));
    if (isDocManager) {
      api<FlaggedDoc[]>("/documents/flagged")
        .then(setFlaggedDocs)
        .catch(() => {});
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

  // Polling when background processing
  useEffect(() => {
    if (!docs?.some((d) => d.status === "processing")) return;
    const timer = setTimeout(load, 2500);
    return () => clearTimeout(timer);
  }, [docs]);

  // Load preview image when selectedDoc or previewPage changes
  useEffect(() => {
    if (!selectedDoc) {
      setPreviewImgUrl(null);
      return;
    }
    setPreviewImgLoading(true);
    setPreviewZoom(1);
    let cancelled = false;
    const pageToLoad = Math.max(1, previewPage);
    imageUrl(`/documents/${selectedDoc.id}/pages/${pageToLoad}`)
      .then((u) => {
        if (!cancelled) setPreviewImgUrl(u);
      })
      .catch(() => {
        if (!cancelled) setPreviewImgUrl(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewImgLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDoc, previewPage]);

  // Load job status when opening processing tab
  useEffect(() => {
    if (selectedDoc && docDrawerTab === "processing") {
      setJobLoading(true);
      api<DocStatus>(`/documents/${selectedDoc.id}/status`)
        .then(setJobStatus)
        .catch(() => {})
        .finally(() => setJobLoading(false));
    }
  }, [selectedDoc, docDrawerTab]);

  async function saveAccess(doc: Doc, grants: Grant[], classification = doc.classification) {
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
      showToast(`Access rules updated for "${doc.title}".`, "success");
      await load();
      // Update active drawer document object
      const refreshed = (await api<Doc[]>("/documents")).find((d) => d.id === doc.id);
      if (refreshed) setSelectedDoc(refreshed);
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  async function confirmDelete() {
    if (!deletingDoc) return;
    setDeleteBusy(true);
    try {
      await api(`/documents/${deletingDoc.id}`, { method: "DELETE" });
      showToast(`"${deletingDoc.title}" removed from catalog.`, "success");
      setDeletingDoc(null);
      if (selectedDoc?.id === deletingDoc.id) setSelectedDoc(null);
      await load();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function reprocessDoc(doc: Doc) {
    try {
      await post(`/documents/${doc.id}/reprocess`, {});
      showToast(`Reprocessing started for "${doc.title}".`, "info");
      await load();
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  }

  async function handleFlaggedDecision(docId: string, decision: "approve" | "purge") {
    setReviewBusy(true);
    try {
      await post(`/documents/${docId}/review-flagged`, {
        decision,
        note: reviewNote.trim() || undefined,
      });
      showToast(
        decision === "approve"
          ? "Document approved and indexed in knowledge base."
          : "Quarantined document purged.",
        "success"
      );
      setReviewingFlagged(null);
      setReviewNote("");
      await load();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setReviewBusy(false);
    }
  }

  async function submitDelegatedRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!delegatingDoc || !delegateTargetUser || !delegateReason.trim()) return;
    setDelegateSubmitting(true);
    try {
      await post("/access-requests", {
        resource_type: "document",
        resource_id: delegatingDoc.id,
        target_user_id: delegateTargetUser,
        reason: delegateReason.trim(),
      });
      showToast("Delegated access request submitted for team member.", "success");
      setDelegatingDoc(null);
      setDelegateTargetUser("");
      setDelegateReason("");
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setDelegateSubmitting(false);
    }
  }

  // Helper to summarize access for table row
  const getSharedWithSummary = (doc: Doc) => {
    const grants = doc.access || [];
    if (grants.some((g) => g.subject_type === "everyone")) return "Everyone";

    const roleGrants = grants.filter((g) => g.subject_type === "role");
    const deptGrants = grants.filter((g) => g.subject_type === "department");
    const userGrants = grants.filter((g) => g.subject_type === "user");

    const parts: string[] = [];
    if (roleGrants.length > 0) {
      const firstRoleName = roles.find((r) => r.id === roleGrants[0].subject_id)?.name || roleGrants[0].subject_id;
      parts.push(roleGrants.length > 1 ? `${firstRoleName} +${roleGrants.length - 1}` : `${firstRoleName}`);
    }
    if (deptGrants.length > 0) {
      const deptName = departments.find((d) => d.id === deptGrants[0].subject_id)?.name || deptGrants[0].subject_id;
      parts.push(`${deptName} Dept`);
    }
    if (userGrants.length > 0) {
      const firstUserName = users.find((u) => u.id === userGrants[0].subject_id)?.name || userGrants[0].label || "1 user";
      parts.push(userGrants.length > 1 ? `${firstUserName} +${userGrants.length - 1}` : firstUserName);
    }

    return parts.length > 0 ? parts.join(", ") : "Private (Owner only)";
  };

  const filteredDocs = (docs || []).filter((d) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!d.title.toLowerCase().includes(q) && !d.filename.toLowerCase().includes(q)) return false;
    }
    if (activeFilterTab === "active") return d.status === "active";
    if (activeFilterTab === "processing") return d.status === "processing";
    if (activeFilterTab === "flagged") return d.flagged || d.status === "flagged";
    if (activeFilterTab === "dept") return d.readable;
    return true;
  });

  const activeCount = (docs || []).filter((d) => d.status === "active").length;
  const processingCount = (docs || []).filter((d) => d.status === "processing").length;
  const flaggedCount = (docs || []).filter((d) => d.flagged || d.status === "flagged").length;

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Page Header with single Upload Action */}
      <PageHeader
        title="Documents"
        subtitle="Searchable enterprise documents matched to your role permissions and security clearance."
        action={
          canUpload ? (
            <Button
              kind="primary"
              onClick={() => setUploadDrawerOpen(true)}
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              <span>Upload document</span>
            </Button>
          ) : undefined
        }
      />

      {error && <Notice tone="error">{error}</Notice>}

      {/* 2. Compact Operational Metrics Strip */}
      {docs === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      ) : (
        <section aria-label="Catalog metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Documents"
            value={docs.length}
            subtext="In organization catalog"
          />
          <StatCard
            label="Ready to Search"
            value={activeCount}
            subtext="Active in vector knowledge store"
            tone="emerald"
          />
          <StatCard
            label="Processing Queue"
            value={processingCount}
            subtext="OCR and passage extraction"
            tone={processingCount > 0 ? "sky" : "default"}
          />
          <StatCard
            label="Flagged for Review"
            value={flaggedDocs.length || flaggedCount}
            subtext={
              flaggedDocs.length > 0
                ? "Click to review quarantined files"
                : "Zero security flags detected"
            }
            tone={flaggedDocs.length > 0 || flaggedCount > 0 ? "amber" : "default"}
            onClick={
              flaggedDocs.length > 0
                ? () => setReviewingFlagged(flaggedDocs[0])
                : undefined
            }
          />
        </section>
      )}

      {/* 3. Sticky Filter & Search Toolbar */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-8 lg:-mx-12 px-4 sm:px-8 lg:px-12 py-3 bg-page/95 backdrop-blur-md border-b border-line">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Segmented Filter Pills */}
          <div className="flex flex-wrap gap-1.5 text-xs">
            <button
              onClick={() => setActiveFilterTab("all")}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                activeFilterTab === "all"
                  ? "bg-ink font-medium text-white shadow-xs"
                  : "border border-line bg-surface text-muted hover:text-ink"
              }`}
            >
              All ({docs?.length ?? 0})
            </button>
            <button
              onClick={() => setActiveFilterTab("active")}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                activeFilterTab === "active"
                  ? "bg-ink font-medium text-white shadow-xs"
                  : "border border-line bg-surface text-muted hover:text-ink"
              }`}
            >
              Active ({activeCount})
            </button>
            {processingCount > 0 && (
              <button
                onClick={() => setActiveFilterTab("processing")}
                className={`rounded-full px-3 py-1.5 transition-colors ${
                  activeFilterTab === "processing"
                    ? "bg-sky-700 font-medium text-white shadow-xs"
                    : "border border-line bg-surface text-muted hover:text-sky-700"
                }`}
              >
                Processing ({processingCount})
              </button>
            )}
            {(flaggedDocs.length > 0 || flaggedCount > 0) && (
              <button
                onClick={() => setActiveFilterTab("flagged")}
                className={`rounded-full px-3 py-1.5 transition-colors ${
                  activeFilterTab === "flagged"
                    ? "bg-amber-700 font-medium text-white shadow-xs"
                    : "border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                }`}
              >
                Flagged ({flaggedDocs.length || flaggedCount})
              </button>
            )}
            {isDeptLead && (
              <button
                onClick={() => setActiveFilterTab("dept")}
                className={`rounded-full px-3 py-1.5 transition-colors ${
                  activeFilterTab === "dept"
                    ? "bg-ink font-medium text-white shadow-xs"
                    : "border border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                My Department
              </button>
            )}
          </div>

          {/* Search input */}
          <div className="w-full sm:w-64">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
              <input
                type="text"
                placeholder="Filter documents…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Compact Document List Table */}
      {docs === null ? (
        <TableSkeleton rows={6} />
      ) : filteredDocs.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-12 text-center space-y-3">
          <FileText className="mx-auto h-8 w-8 text-muted" />
          <h3 className="display text-xl font-semibold text-ink">No documents found</h3>
          <p className="text-xs text-muted max-w-sm mx-auto">
            {searchQuery
              ? "No documents match your search query."
              : "No documents match the selected filter."}
          </p>
          {canUpload && (
            <Button onClick={() => setUploadDrawerOpen(true)} kind="primary" className="mt-2">
              Upload first document
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
          <table className="w-full text-left text-sm hidden md:table">
            <thead className="border-b border-line bg-surface-subtle/70 text-xs text-muted font-mono uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">Document Title</th>
                <th className="px-4 py-3 font-medium">Clearance</th>
                <th className="px-4 py-3 font-medium">Shared With</th>
                <th className="px-4 py-3 font-medium">Pages</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredDocs.map((doc) => (
                <tr
                  key={doc.id}
                  onClick={() => {
                    setSelectedDoc(doc);
                    setDocDrawerTab("access");
                    setPreviewPage(1);
                  }}
                  className="cursor-pointer hover:bg-surface-hover/70 transition-colors group"
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-ink font-mono text-[0.65rem] uppercase font-bold border border-line">
                        {doc.kind}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-ink text-sm group-hover:text-accent truncate">
                          {doc.title}
                        </p>
                        <p className="text-[0.7rem] text-muted font-mono truncate">{doc.filename}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <ClearancePill clearance={doc.classification} label={doc.classification_label} />
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-ink/90 font-medium">
                      {getSharedWithSummary(doc)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted font-mono">
                    {doc.page_count > 0 ? `${doc.page_count} page${doc.page_count > 1 ? "s" : ""}` : "0 pages (scanned)"}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusPill status={doc.status} />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-xs text-accent underline underline-offset-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      Inspect →
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile Stacked Card View (<768px) */}
          <div className="divide-y divide-line md:hidden">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                onClick={() => {
                  setSelectedDoc(doc);
                  setDocDrawerTab("access");
                  setPreviewPage(1);
                }}
                className="p-4 space-y-2 cursor-pointer active:bg-surface-subtle"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-ink text-sm">{doc.title}</h3>
                    <p className="text-[0.7rem] text-muted font-mono">{doc.filename}</p>
                  </div>
                  <StatusPill status={doc.status} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted pt-1">
                  <ClearancePill clearance={doc.classification} label={doc.classification_label} />
                  <span className="font-mono text-[0.7rem]">{doc.page_count} page(s)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Document Details Side Drawer */}
      <Drawer
        isOpen={Boolean(selectedDoc)}
        onClose={() => setSelectedDoc(null)}
        title={selectedDoc?.title || "Document Details"}
        subtitle={selectedDoc ? `${selectedDoc.filename} • ${selectedDoc.kind.toUpperCase()}` : undefined}
        widthClass="max-w-2xl"
      >
        {selectedDoc && (
          <div className="space-y-6">
            {/* Drawer Tabs Bar */}
            <div className="flex border-b border-line gap-4 text-xs font-medium">
              <button
                type="button"
                onClick={() => setDocDrawerTab("access")}
                className={`pb-2.5 transition-colors border-b-2 ${
                  docDrawerTab === "access"
                    ? "border-ink text-ink font-semibold"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                Access & Roles
              </button>
              <button
                type="button"
                onClick={() => setDocDrawerTab("pages")}
                className={`pb-2.5 transition-colors border-b-2 ${
                  docDrawerTab === "pages"
                    ? "border-ink text-ink font-semibold"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                Page Preview ({selectedDoc.page_count})
              </button>
              <button
                type="button"
                onClick={() => setDocDrawerTab("processing")}
                className={`pb-2.5 transition-colors border-b-2 ${
                  docDrawerTab === "processing"
                    ? "border-ink text-ink font-semibold"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                Pipeline Status
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => setDocDrawerTab("danger")}
                  className={`pb-2.5 transition-colors border-b-2 ${
                    docDrawerTab === "danger"
                      ? "border-deny text-deny font-semibold"
                      : "border-transparent text-muted hover:text-deny"
                  }`}
                >
                  Danger Zone
                </button>
              )}
            </div>

            {/* TAB 1: Access & Roles */}
            {docDrawerTab === "access" && (
              <div className="space-y-4">
                {canManageGrants ? (
                  <AccessEditor
                    doc={selectedDoc}
                    roles={roles}
                    users={users}
                    departments={departments}
                    onSave={saveAccess}
                  />
                ) : (
                  <div className="rounded-xl border border-line bg-surface p-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink">Access Scope:</span>
                      <ClearancePill clearance={selectedDoc.classification} />
                    </div>
                    <p className="text-muted leading-relaxed">
                      This document is shared with: <strong className="text-ink">{getSharedWithSummary(selectedDoc)}</strong>.
                    </p>
                    {isDeptLead && (
                      <Button
                        kind="secondary"
                        onClick={() => setDelegatingDoc(selectedDoc)}
                        className="mt-2"
                      >
                        Request access for team member
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Page Previews */}
            {docDrawerTab === "pages" && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted font-mono">
                        Page {previewPage} of {Math.max(1, selectedDoc.page_count)}
                      </span>
                      {selectedDoc.page_count > 1 && (
                        <div className="flex items-center gap-1">
                          <Button
                            kind="secondary"
                            disabled={previewPage <= 1}
                            onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            kind="secondary"
                            disabled={previewPage >= selectedDoc.page_count}
                            onClick={() => setPreviewPage((p) => Math.min(selectedDoc.page_count, p + 1))}
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {previewImgUrl && (
                        <>
                          <button
                            type="button"
                            onClick={() => setPreviewZoom((z) => Math.min(2.5, z + 0.25))}
                            className="rounded p-1 text-muted hover:bg-surface-hover hover:text-ink transition-colors"
                            title="Zoom in"
                          >
                            <ZoomIn className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewZoom((z) => Math.max(0.75, z - 0.25))}
                            className="rounded p-1 text-muted hover:bg-surface-hover hover:text-ink transition-colors"
                            title="Zoom out"
                          >
                            <ZoomOut className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewZoom(1)}
                            className="rounded p-1 text-muted hover:bg-surface-hover hover:text-ink transition-colors"
                            title="Reset zoom"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                          <a
                            href={previewImgUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[0.7rem] text-accent hover:underline flex items-center gap-1 ml-1"
                          >
                            <span>Open</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex min-h-[380px] max-h-[600px] items-center justify-center rounded-xl border border-line bg-page p-3 shadow-inner overflow-auto">
                    {previewImgLoading ? (
                      <div className="flex flex-col items-center gap-2 p-8 text-xs text-muted">
                        <RefreshCw className="h-5 w-5 animate-spin text-accent" />
                        <span>Rendering optical page scan…</span>
                      </div>
                    ) : previewImgUrl ? (
                      <img
                        src={previewImgUrl}
                        alt={`Page ${previewPage} of ${selectedDoc.title}`}
                        style={{
                          transform: `scale(${previewZoom})`,
                          transformOrigin: "top center",
                          transition: "transform 0.15s ease-out",
                        }}
                        className="max-h-[540px] w-full object-contain rounded-lg border border-line shadow-xs"
                      />
                    ) : (
                      <div className="p-8 text-center text-xs text-muted space-y-2">
                        <FileText className="h-8 w-8 mx-auto text-muted/60" />
                        <p className="font-semibold text-ink">Page Preview Unavailable</p>
                        <p>The system is generating an optical snapshot for this document.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: Pipeline Status & Reprocessing */}
            {docDrawerTab === "processing" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-line bg-surface p-4 space-y-3 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-line">
                    <span className="text-muted">Document ID:</span>
                    <span className="font-mono text-ink">{selectedDoc.id}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-line">
                    <span className="text-muted">Status:</span>
                    <StatusPill status={selectedDoc.status} />
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-line">
                    <span className="text-muted">Pipeline Stage:</span>
                    <span className="font-semibold text-accent capitalize">
                      {jobStatus?.stage || "Indexing Complete"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-line">
                    <span className="text-muted">Total Pages:</span>
                    <span className="font-mono">{selectedDoc.page_count}</span>
                  </div>
                  {selectedDoc.checksum && (
                    <div className="flex justify-between py-1.5 border-b border-line">
                      <span className="text-muted">SHA-256 Checksum:</span>
                      <span className="font-mono text-[0.65rem] text-ink truncate max-w-xs">
                        {selectedDoc.checksum}
                      </span>
                    </div>
                  )}
                  {selectedDoc.note && (
                    <div className="py-1.5">
                      <span className="text-muted block">Ingestion Note:</span>
                      <p className="mt-1 text-ink">{selectedDoc.note}</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    kind="secondary"
                    onClick={() => reprocessDoc(selectedDoc)}
                    className="flex items-center gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Reprocess Document</span>
                  </Button>
                </div>
              </div>
            )}

            {/* TAB 4: Danger Zone */}
            {docDrawerTab === "danger" && canDelete && (
              <div className="rounded-xl border border-deny-border bg-deny-bg/40 p-5 space-y-3">
                <h3 className="display text-xl font-semibold text-deny">Delete this document</h3>
                <p className="text-xs text-muted leading-relaxed">
                  Deleting this document permanently purges the source file and deletes all associated passage vector embeddings from the isolated index.
                </p>
                <div className="pt-2">
                  <Button
                    kind="danger"
                    onClick={() => setDeletingDoc(selectedDoc)}
                    className="flex items-center gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete "{selectedDoc.title}"</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* 6. Upload Document Drawer */}
      <Drawer
        isOpen={uploadDrawerOpen}
        onClose={() => setUploadDrawerOpen(false)}
        title="Upload Document"
        subtitle="Ingest PDF, scanned images, Excel or Markdown files with automated pre-indexing security checks."
      >
        <UploadForm
          roles={roles}
          departments={departments}
          onDone={() => {
            setUploadDrawerOpen(false);
            showToast("Document uploaded and queued for indexing.", "success");
            load();
          }}
          onCancel={() => setUploadDrawerOpen(false)}
        />
      </Drawer>

      {/* 7. Quarantine Review Drawer */}
      <Drawer
        isOpen={Boolean(reviewingFlagged)}
        onClose={() => setReviewingFlagged(null)}
        title="Quarantine Review"
        subtitle={reviewingFlagged?.title}
      >
        {reviewingFlagged && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs space-y-1.5">
              <p className="font-semibold text-amber-900">Ingestion Sanitizer Flag Reason:</p>
              <p className="text-amber-800 leading-relaxed">
                {reviewingFlagged.note || "Indirect prompt injection pattern identified in source text."}
              </p>
            </div>

            {reviewingFlagged.sample_chunks && reviewingFlagged.sample_chunks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted font-mono">
                  Extracted Sample Passages:
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {reviewingFlagged.sample_chunks.map((chunk, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-line bg-surface-subtle p-3 text-xs font-mono text-ink"
                    >
                      <span className="font-bold text-accent">Page {chunk.page}: </span>
                      {chunk.text}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Auditor / Review Note (Optional):
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                placeholder="e.g. Verified harmless sample document, approved for vector search."
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
                Purge File
              </Button>
              <Button
                kind="primary"
                onClick={() => handleFlaggedDecision(reviewingFlagged.id, "approve")}
                disabled={reviewBusy}
              >
                {reviewBusy ? "Saving..." : "Approve & Activate"}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* 8. Delegated Access Request Modal */}
      <Drawer
        isOpen={Boolean(delegatingDoc)}
        onClose={() => setDelegatingDoc(null)}
        title="Request for Team Member"
        subtitle={delegatingDoc ? `Grant request for "${delegatingDoc.title}"` : undefined}
      >
        {delegatingDoc && (
          <form onSubmit={submitDelegatedRequest} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1.5">Select Colleague *</label>
              <select
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
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
              <label className="block text-xs font-medium text-ink mb-1.5">Business Justification *</label>
              <textarea
                className="w-full rounded-lg border border-line bg-surface p-3 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none min-h-[100px]"
                placeholder="Explain why this colleague requires access to this document for project assignments..."
                value={delegateReason}
                onChange={(e) => setDelegateReason(e.target.value)}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                kind="secondary"
                onClick={() => setDelegatingDoc(null)}
                disabled={delegateSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={delegateSubmitting || !delegateTargetUser || !delegateReason.trim()}>
                {delegateSubmitting ? "Submitting..." : "Submit Delegated Request"}
              </Button>
            </div>
          </form>
        )}
      </Drawer>

      {/* 9. Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingDoc)}
        onClose={() => setDeletingDoc(null)}
        onConfirm={confirmDelete}
        title={`Delete "${deletingDoc?.title}"?`}
        description="This will permanently delete the file and purge all associated vector embeddings from the search index."
        confirmText="Yes, delete document"
        tone="danger"
        busy={deleteBusy}
      />
    </div>
  );
}
