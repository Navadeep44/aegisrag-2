import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  Upload,
  Search,
  FileText,
  Shield,
  Eye,
  RefreshCw,
  Trash2,
  AlertTriangle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Database,
  Heading,
  Check,
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
import { RowPolicyEditor } from "../features/documents/RowPolicyEditor";
import { DocumentWorkflowExplainer } from "../features/documents/DocumentWorkflowExplainer";
import { kindStyle } from "../lib/kinds";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ui/Toast";
import { useWebSocketEvent } from "../context/WebSocketContext";
import { api, imageUrl, post } from "../lib/api";
import type { Department, Doc, DocStatus, FlaggedDoc, Grant, Role, SectionMeta, User } from "../lib/types";
import { hasPermission } from "../lib/types";

type ScoreboardData = {
  total_documents: number;
  active_documents: number;
  processing_documents: number;
  flagged_documents: number;
  total_pages: number;
  total_chunks: number;
  health_score: number;
  ready_to_search_percentage: number;
};

const LEVEL_EDGE = ["border-l-level-0", "border-l-level-1", "border-l-level-2", "border-l-level-3"];

export default function Documents() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreboardData | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState("");

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilterTab, setActiveFilterTab] = useState<string>("all");
  const [showPipelineGuide, setShowPipelineGuide] = useState(false);

  // Drawers & Modals
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [docDrawerTab, setDocDrawerTab] = useState<"access" | "sections" | "pages" | "processing" | "danger">("access");

  // Extracted PDF Headings & Database Records state
  const [sections, setSections] = useState<SectionMeta[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [savingSectionId, setSavingSectionId] = useState<string | null>(null);

  // Preview state inside drawer
  const [previewPage, setPreviewPage] = useState(1);
  const [previewImgUrl, setPreviewImgUrl] = useState<string | null>(null);
  const [previewImgLoading, setPreviewImgLoading] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);
  const previewDragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Ingestion job status
  const [jobStatus, setJobStatus] = useState<DocStatus | null>(null);

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

  const load = () => {
    api<Doc[]>("/documents")
      .then(setDocs)
      .catch((e) => setError((e as Error).message));
    api<ScoreboardData>("/documents/scoreboard")
      .then(setScoreboard)
      .catch(() => {});
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

  // Real-time WebSocket subscriptions - eliminates manual browser refreshing
  useWebSocketEvent("document.status_changed", (ev) => {
    setDocs((prev) =>
      prev
        ? prev.map((d) =>
            d.id === ev.document_id
              ? {
                  ...d,
                  status: ev.status || (ev.stage === "complete" ? "active" : d.status),
                  stage: ev.stage || d.stage,
                  progress_percent: ev.percent !== undefined ? ev.percent : (ev.stage === "complete" ? 100 : d.progress_percent),
                }
              : d
          )
        : prev
    );
    if (ev.status === "active" || ev.stage === "complete") {
      load();
    }
    if (selectedDoc && ev.document_id === selectedDoc.id) {
      setJobStatus((prev) =>
        prev
          ? {
              ...prev,
              stage: ev.stage || prev.stage,
              status: ev.status || prev.status,
              percent: ev.percent !== undefined ? ev.percent : prev.percent,
            }
          : null
      );
    }
  });
  useWebSocketEvent("document.created", () => load());
  useWebSocketEvent("document.deleted", () => load());
  useWebSocketEvent("document.access_changed", () => load());

  // Polling backup when background processing
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
    setPreviewPan({ x: 0, y: 0 });
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
      api<DocStatus>(`/documents/${selectedDoc.id}/status`)
        .then(setJobStatus)
        .catch(() => {});
    }
  }, [selectedDoc, docDrawerTab]);

  // Load extracted sections when selectedDoc or docDrawerTab changes
  useEffect(() => {
    if (!selectedDoc) {
      setSections([]);
      return;
    }
    if (selectedDoc.sections_metadata && selectedDoc.sections_metadata.length > 0) {
      setSections(selectedDoc.sections_metadata);
    }
    if (docDrawerTab === "sections") {
      setSectionsLoading(true);
      api<{ sections: SectionMeta[] }>(`/documents/${selectedDoc.id}/sections`)
        .then((res) => {
          if (res.sections) setSections(res.sections);
        })
        .catch(() => {
          if (selectedDoc.sections_metadata) setSections(selectedDoc.sections_metadata);
        })
        .finally(() => setSectionsLoading(false));
    }
  }, [selectedDoc, docDrawerTab]);

  async function handleToggleRoleForSection(sectionId: string, roleSlug: string) {
    if (!selectedDoc) return;
    const target = sections.find((s) => s.section_id === sectionId);
    if (!target) return;
    const currentRoles = target.allowed_roles || [];
    const updatedRoles = currentRoles.includes(roleSlug)
      ? currentRoles.filter((r) => r !== roleSlug)
      : [...currentRoles, roleSlug];

    setSections((prev) =>
      prev.map((s) => (s.section_id === sectionId ? { ...s, allowed_roles: updatedRoles } : s))
    );
    setSavingSectionId(sectionId);

    try {
      await api(`/documents/${selectedDoc.id}/sections/${sectionId}/access`, {
        method: "PUT",
        body: JSON.stringify({ allowed_roles: updatedRoles }),
      });
      showToast(`Role access saved for section "${target.heading}".`, "success");
      load();
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setSavingSectionId(null);
    }
  }

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

  const handlePreviewWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setPreviewZoom((z) => Math.min(4, Math.max(0.5, +(z + delta).toFixed(2))));
  };

  const handlePreviewMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPreviewDragging(true);
    previewDragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: previewPan.x,
      panY: previewPan.y,
    };
  };

  const handlePreviewMouseMove = (e: React.MouseEvent) => {
    if (!isPreviewDragging) return;
    setPreviewPan({
      x: previewDragStartRef.current.panX + (e.clientX - previewDragStartRef.current.x),
      y: previewDragStartRef.current.panY + (e.clientY - previewDragStartRef.current.y),
    });
  };

  const handlePreviewDoubleClick = () => {
    if (previewZoom > 1 || previewPan.x !== 0 || previewPan.y !== 0) {
      setPreviewZoom(1);
      setPreviewPan({ x: 0, y: 0 });
    } else {
      setPreviewZoom(2);
    }
  };

  return (
    <div className="space-y-5 pb-16">
      <PageHeader
        icon={FileText}
        title="Documents"
        subtitle="Enterprise knowledge assets, multi-modal ingestion status, and RBAC policies."
        action={
          <div className="flex items-center gap-2">
            <Button
              kind="secondary"
              onClick={() => setShowPipelineGuide(!showPipelineGuide)}
              className="hidden sm:inline-flex items-center gap-1.5"
            >
              <Layers className="h-4 w-4 text-accent" />
              <span>{showPipelineGuide ? "Hide Pipeline" : "Pipeline Architecture"}</span>
            </Button>
            {canUpload && (
              <Button onClick={() => setUploadDrawerOpen(true)}>
                <Upload className="h-4 w-4" /> Upload
              </Button>
            )}
          </div>
        }
      />

      {/* Interactive Processing Architecture Guide */}
      <AnimatePresence>
        {showPipelineGuide && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="glass-premium rounded-3xl border border-accent/40 p-6 sm:p-8 shadow-lg">
              <DocumentWorkflowExplainer showHeading={true} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <Notice tone="error">{error}</Notice>}

      {/* 2. Documents Score Board Strip */}
      <section aria-label="Documents scoreboard" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {docs === null ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Total Documents"
              value={scoreboard?.total_documents ?? docs.length}
              subtext={`${scoreboard?.total_pages ?? docs.reduce((a, b) => a + (b.page_count || 1), 0)} pages • ${scoreboard?.total_chunks ?? 0} indexed chunks`}
            />
            <StatCard
              label="Ready to Search"
              value={scoreboard?.active_documents ?? activeCount}
              subtext={`${scoreboard?.ready_to_search_percentage ?? Math.round((activeCount / Math.max(docs.length, 1)) * 100)}% verified & indexed`}
              tone="emerald"
            />
            <StatCard
              label="Ingestion & OCR Health"
              value={`${scoreboard?.health_score ?? (processingCount > 0 ? 85 : 100)}%`}
              subtext={processingCount > 0 ? `${processingCount} documents processing` : "All pipelines operational"}
              tone={processingCount > 0 ? "amber" : "emerald"}
            />
            <StatCard
              label="Quarantined / Flagged"
              value={scoreboard?.flagged_documents ?? (flaggedDocs.length || flaggedCount)}
              subtext={flaggedCount > 0 ? "Prompt injection or syntax hazard" : "Zero active quarantine threats"}
              tone={flaggedCount > 0 ? "rose" : "default"}
            />
          </>
        )}
      </section>

      {/* 3. Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 text-xs">
          {([
            ["all", `All · ${docs?.length ?? 0}`, true],
            ["active", `Active · ${activeCount}`, true],
            ["processing", `Processing · ${processingCount}`, processingCount > 0],
            ["flagged", `Flagged · ${flaggedDocs.length || flaggedCount}`, flaggedDocs.length > 0 || flaggedCount > 0],
            ["dept", "Readable by me", Boolean(isDeptLead)],
          ] as [string, string, boolean][]).filter((f) => f[2]).map(([id, label]) => (
            <button key={id} onClick={() => setActiveFilterTab(id)}
              className={`rounded-full border px-3 py-1.5 font-semibold transition-colors ${
                activeFilterTab === id ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input type="text" placeholder="Filter…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted-light focus:border-accent/50 focus:outline-none" />
        </div>
      </div>

      {docs === null ? (
        <TableSkeleton rows={6} />
      ) : filteredDocs.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-light" />
          <p className="mt-2 text-sm text-muted">No documents here.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredDocs.map((doc, i) => {
            const k = kindStyle(doc.kind, doc.note);
            const KIcon = k.icon;
            return (
              <motion.button key={doc.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}
                onClick={() => { setSelectedDoc(doc); setDocDrawerTab("access"); setPreviewPage(1); }}
                className={`glass glass-hover group relative overflow-hidden rounded-2xl border-l-4 p-4 text-left ${LEVEL_EDGE[doc.classification] ?? ""}`}>
                <div className="flex items-start gap-3">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${k.tint}`}><KIcon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink group-hover:text-accent">{doc.title}</p>
                    <p className="truncate text-[11px] text-muted">{k.label} · {doc.page_count || 1} {doc.kind === "database" ? "table" : "page"}{doc.page_count > 1 ? "s" : ""}</p>
                  </div>
                  {doc.readable ? <Eye className="h-4 w-4 text-allow" aria-label="You can read this" /> : <Shield className="h-4 w-4 text-muted-light" aria-label="You manage but cannot read this" />}
                </div>

                {/* Processing Progress Bar on Card */}
                {doc.status === "processing" && (
                  <div className="mt-2.5 rounded-lg border border-amber-200/70 bg-amber-50/80 dark:bg-amber-950/20 p-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-medium text-amber-900 dark:text-amber-300">
                      <span className="flex items-center gap-1.5 capitalize font-mono text-[10px]">
                        <RefreshCw className="h-3 w-3 animate-spin text-amber-600" />
                        {doc.stage ? `${doc.stage} stage…` : "Ingesting…"}
                      </span>
                      <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                        {doc.progress_percent ?? 35}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-200/60 dark:bg-amber-900/40">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-300 ease-out"
                        style={{ width: `${Math.max(10, doc.progress_percent ?? 35)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <ClearancePill clearance={doc.classification} label={doc.classification_label} />
                  {doc.status !== "active" && (
                    <StatusPill status={doc.status} percent={doc.progress_percent} stage={doc.stage} />
                  )}
                  {doc.flagged && <span className="chip text-warn"><AlertTriangle className="h-3 w-3" /> injection removed</span>}
                  {doc.row_policy?.column && <span className="chip text-emerald-700"><Layers className="h-3 w-3" /> row rules</span>}
                  {canManage && <span className="chip max-w-[160px] truncate"><UserPlus className="h-3 w-3" /> {getSharedWithSummary(doc)}</span>}
                </div>
              </motion.button>
            );
          })}
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
                onClick={() => setDocDrawerTab("sections")}
                className={`pb-2.5 transition-colors border-b-2 flex items-center gap-1.5 ${
                  docDrawerTab === "sections"
                    ? "border-ink text-ink font-semibold"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                <span>{selectedDoc.kind === "database" ? "Schema" : "Sections"}</span>
                {sections.length > 0 && (
                  <span className="rounded-full bg-accent/15 px-1.5 py-0.2 text-[0.65rem] font-bold text-accent">
                    {sections.length}
                  </span>
                )}
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

            {/* TAB 2: Extracted Headings / Database Schema */}
            {docDrawerTab === "sections" && (
              <div className="space-y-4">
                {(selectedDoc.kind === "database" || selectedDoc.kind === "xlsx") && (canManageGrants || isDocManager) && (
                  <RowPolicyEditor key={selectedDoc.id} doc={selectedDoc} roles={roles} onSaved={load} />
                )}
                {selectedDoc.kind === "database" ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
                      <div className="flex items-center justify-between pb-1">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-accent" />
                          <h4 className="font-semibold text-ink text-sm">Table Schema</h4>
                        </div>
                        <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-mono text-muted border border-line">
                          {selectedDoc.data_schema?.total_rows ?? 0} Rows
                        </span>
                      </div>
                      {selectedDoc.data_schema?.columns && (
                        <div>
                          <p className="text-[0.7rem] uppercase font-mono tracking-wider text-muted mb-1.5">Detected Columns</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedDoc.data_schema.columns.map((col) => (
                              <span
                                key={col}
                                className="rounded-md border border-line bg-surface-subtle px-2 py-1 text-xs font-mono font-medium text-ink"
                              >
                                {col}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {selectedDoc.data_schema?.sample_preview && selectedDoc.data_schema.sample_preview.length > 0 && selectedDoc.data_schema.columns && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted font-mono">
                          Sample Ingested Rows ({selectedDoc.data_schema.sample_preview.length} sample):
                        </p>
                        <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-surface-subtle border-b border-line text-muted font-mono uppercase tracking-wider">
                              <tr>
                                {selectedDoc.data_schema.columns.map((col) => (
                                  <th key={col} className="px-3 py-2 font-medium">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {selectedDoc.data_schema.sample_preview.slice(0, 5).map((row: Record<string, unknown>, rIdx: number) => (
                                <tr key={rIdx} className="hover:bg-surface-hover/50">
                                  {selectedDoc.data_schema?.columns.map((col) => (
                                    <td key={col} className="px-3 py-2 text-ink font-mono whitespace-nowrap">
                                      {String(row[col] ?? "")}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-1">
                      <div className="flex items-center gap-2">
                        <Heading className="h-4 w-4 text-accent" />
                        <h4 className="font-semibold text-ink text-sm">Document Sections</h4>
                      </div>
                      <span className="text-xs text-muted">Click role to restrict access</span>
                    </div>

                    {sectionsLoading ? (
                      <div className="flex items-center justify-center p-8 text-xs text-muted gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin text-accent" />
                        <span>Extracting document sections and outline...</span>
                      </div>
                    ) : sections.length === 0 ? (
                      <div className="rounded-xl border border-line bg-surface-subtle p-6 text-center text-xs text-muted space-y-1">
                        <p className="font-semibold text-ink">No Headings Detected</p>
                        <p>All passages in this document currently inherit document-level access grants.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {sections.map((sec, idx) => (
                          <div
                            key={sec.section_id || idx}
                            className="rounded-xl border border-line bg-surface p-4 space-y-3 shadow-xs"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-5 w-5 items-center justify-center rounded bg-accent/15 text-accent font-mono text-[0.65rem] font-bold shrink-0">
                                    §
                                  </span>
                                  <h5 className="font-semibold text-ink text-sm truncate">{sec.heading}</h5>
                                </div>
                                {sec.preview && (
                                  <p className="mt-1 text-xs text-muted line-clamp-2 italic">
                                    "{sec.preview}"
                                  </p>
                                )}
                              </div>
                              <span className="shrink-0 rounded bg-surface-subtle px-2 py-0.5 text-[0.7rem] font-mono text-muted border border-line">
                                Page {sec.page}
                              </span>
                            </div>

                            {/* Role Permission Toggles */}
                            <div className="pt-2 border-t border-line/60">
                              <div className="flex items-center justify-between text-xs mb-2">
                                <span className="font-medium text-muted">Authorized Roles:</span>
                                <span className="text-[0.65rem] text-muted font-mono">
                                  {sec.allowed_roles && sec.allowed_roles.length > 0
                                    ? `${sec.allowed_roles.length} restricted`
                                    : "All roles allowed"}
                                </span>
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                {roles.map((r) => {
                                  const roleSlug = r.slug || r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                                  const isAllowed =
                                    !sec.allowed_roles ||
                                    sec.allowed_roles.length === 0 ||
                                    sec.allowed_roles.includes(roleSlug) ||
                                    sec.allowed_roles.includes(r.name);
                                  const isSaving = savingSectionId === (sec.section_id || sec.id || String(idx));

                                  return (
                                    <button
                                      key={r.id}
                                      type="button"
                                      disabled={isSaving}
                                      onClick={() => handleToggleRoleForSection(sec.section_id || sec.id || String(idx), roleSlug)}
                                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                                        isAllowed
                                          ? "bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100"
                                          : "bg-surface-subtle text-muted border border-line hover:border-ink hover:text-ink"
                                      }`}
                                    >
                                      {isAllowed ? (
                                        <Check className="h-3 w-3 text-emerald-600" />
                                      ) : (
                                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                      )}
                                      <span>{r.name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
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
                            onClick={() => {
                              setPreviewZoom(1);
                              setPreviewPan({ x: 0, y: 0 });
                            }}
                            className="rounded p-1 text-muted hover:bg-surface-hover hover:text-ink transition-colors"
                            title="Reset zoom and position"
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

                  <div
                    onWheel={handlePreviewWheel}
                    onMouseDown={handlePreviewMouseDown}
                    onMouseMove={handlePreviewMouseMove}
                    onMouseUp={() => setIsPreviewDragging(false)}
                    onMouseLeave={() => setIsPreviewDragging(false)}
                    onDoubleClick={handlePreviewDoubleClick}
                    className="group relative select-none flex min-h-[380px] max-h-[600px] items-center justify-center rounded-xl border border-line bg-page p-3 shadow-inner overflow-hidden"
                    style={{ cursor: isPreviewDragging ? "grabbing" : previewZoom > 1 ? "grab" : "default" }}
                  >
                    {previewImgLoading ? (
                      <div className="flex flex-col items-center gap-2 p-8 text-xs text-muted">
                        <RefreshCw className="h-5 w-5 animate-spin text-accent" />
                        <span>Rendering optical page scan…</span>
                      </div>
                    ) : previewImgUrl ? (
                      <>
                        <div
                          style={{
                            transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})`,
                            transformOrigin: "center center",
                            transition: isPreviewDragging ? "none" : "transform 0.15s ease-out",
                          }}
                          className="inline-block max-w-full"
                        >
                          <img
                            src={previewImgUrl}
                            alt={`Page ${previewPage} of ${selectedDoc.title}`}
                            className="max-h-[540px] w-full object-contain rounded-lg border border-line shadow-xs pointer-events-none select-none"
                          />
                        </div>
                        <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-[10px] text-white/90 backdrop-blur-xs opacity-75 group-hover:opacity-100 transition-opacity">
                          {Math.round(previewZoom * 100)}% · Wheel to zoom · Drag to pan · Double-click to toggle
                        </div>
                      </>
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
                    <StatusPill
                      status={selectedDoc.status}
                      percent={jobStatus?.percent ?? (selectedDoc.status === "active" ? 100 : selectedDoc.progress_percent)}
                      stage={jobStatus?.stage || selectedDoc.stage}
                    />
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-line">
                    <span className="text-muted">Pipeline Stage:</span>
                    <span className="font-semibold text-accent capitalize">
                      {jobStatus?.stage || selectedDoc.stage || "Indexing Complete"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-line">
                    <span className="text-muted">Processing Progress:</span>
                    <span className="font-mono font-bold text-ink">
                      {jobStatus?.percent ?? (selectedDoc.status === "active" ? 100 : selectedDoc.progress_percent ?? 50)}%
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
        title="Upload Documents"
        subtitle="Ingest multiple PDF documents or Database records with automated pre-indexing security checks."
      >
        <UploadForm
          roles={roles}
          departments={departments}
          onDone={() => {
            setUploadDrawerOpen(false);
            showToast("Documents uploaded and queued for background indexing.", "success");
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
