import { useEffect, useState } from "react";
import { KeyRound, Pencil } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { KeyRound as KeyRoundIcon } from "lucide-react";
import { Button } from "../components/ui/Button";
import { StatCard } from "../components/ui/StatCard";
import { TableSkeleton } from "../components/ui/Skeleton";
import { Notice } from "../components/ui/Notice";
import { Drawer } from "../components/ui/Drawer";
import { EmptyState } from "../components/ui/EmptyState";
import { StatusPill } from "../components/ui/StatusPill";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ui/Toast";
import { useWebSocketEvent } from "../context/WebSocketContext";
import { api, patch, post, put } from "../lib/api";
import type { AccessRequest, Doc, User } from "../lib/types";
import { hasPermission } from "../lib/types";

// Helper for clean relative time
function formatRelativeTime(dateString: string): { relative: string; full: string } {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let relative = "Today";
  if (diffDays === 1) relative = "Yesterday";
  else if (diffDays > 1) relative = `${diffDays} days ago`;
  else if (diffHours >= 1) relative = `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;

  return { relative, full: date.toLocaleString() };
}

export default function AccessRequests() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filter state for history
  const [historyFilter, setHistoryFilter] = useState<"all" | "approved" | "rejected">("all");

  // New Request Drawer
  const [showRequestDrawer, setShowRequestDrawer] = useState(false);
  const [resourceType, setResourceType] = useState("document");
  const [resourceId, setResourceId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Edit Request Drawer
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [editTarget, setEditTarget] = useState<AccessRequest | null>(null);
  const [editResourceType, setEditResourceType] = useState("document");
  const [editResourceId, setEditResourceId] = useState("");
  const [editTargetUserId, setEditTargetUserId] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Review Drawer
  const [reviewTarget, setReviewTarget] = useState<AccessRequest | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  const isApprover =
    hasPermission(user, "role.assign") ||
    hasPermission(user, "document.grant.manage") ||
    hasPermission(user, "tenant.manage");
  const canDelegate =
    user?.roles?.some((r) =>
      ["team_lead", "department_manager", "admin", "organization_owner", "iam_admin"].includes(r)
    ) || user?.is_admin;

  const loadData = () => {
    setLoading(true);
    const promises: Promise<unknown>[] = [
      api<AccessRequest[]>("/access-requests").then(setRequests),
      api<Doc[]>("/documents").then(setDocs),
    ];
    if (canDelegate || isApprover || hasPermission(user, "user.read") || hasPermission(user, "tenant.manage") || hasPermission(user, "role.manage")) {
      promises.push(api<User[]>("/users").then(setUsers).catch(() => {}));
    }
    Promise.all(promises)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  // Real-time WebSocket updates - instant refresh on any status or access change
  useWebSocketEvent("access_request.created", () => loadData());
  useWebSocketEvent("access_request.decided", () => loadData());
  useWebSocketEvent("document.created", () => loadData());
  useWebSocketEvent("document.deleted", () => loadData());

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 5) {
      showToast("Please provide a more detailed business reason (at least 5 characters).", "error");
      return;
    }

    setSubmitting(true);
    try {
      await post("/access-requests", {
        resource_type: resourceType,
        resource_id: resourceId.trim() || null,
        reason: reason.trim(),
        target_user_id: targetUserId || undefined,
      });
      showToast("Access request submitted successfully for approval.", "success");
      setShowRequestDrawer(false);
      setReason("");
      setResourceId("");
      setTargetUserId("");
      loadData();
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecision(decision: "approved" | "rejected") {
    if (!reviewTarget) return;
    setReviewBusy(true);
    try {
      await patch(`/access-requests/${reviewTarget.id}`, {
        decision,
        decision_note: decisionNote.trim() || undefined,
      });
      showToast(
        `Access request ${decision === "approved" ? "approved and granted" : "declined"}.`,
        "success"
      );
      setReviewTarget(null);
      setDecisionNote("");
      loadData();
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setReviewBusy(false);
    }
  }

  function openEditDrawer(r: AccessRequest) {
    setEditTarget(r);
    setEditResourceType(r.resource_type);
    setEditResourceId(r.resource_id || "");
    setEditTargetUserId(r.target_user_id || "");
    setEditReason(r.reason);
    setShowEditDrawer(true);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    if (editReason.trim().length < 5) {
      showToast("Please provide a more detailed business reason (at least 5 characters).", "error");
      return;
    }

    setEditSubmitting(true);
    try {
      await put(`/access-requests/${editTarget.id}`, {
        resource_type: editResourceType,
        resource_id: editResourceId.trim() || null,
        reason: editReason.trim(),
        target_user_id: editTargetUserId || undefined,
      });
      showToast("Access request updated successfully.", "success");
      setShowEditDrawer(false);
      setEditTarget(null);
      loadData();
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setEditSubmitting(false);
    }
  }

  const pendingRequests = requests.filter((r) => r.decision === "pending");
  const myPendingRequests = pendingRequests.filter(
    (r) => r.requester_id === user?.id || (user?.email && r.requester_name.toLowerCase().includes(user.name.toLowerCase()))
  );
  const pastRequests = requests.filter((r) => {
    if (r.decision === "pending") return false;
    if (historyFilter === "all") return true;
    return r.decision === historyFilter;
  });

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Page Header with single Request Action */}
      <PageHeader
        icon={KeyRoundIcon}
        title="Access Approvals"
        subtitle="Ask for access, or decide requests."
        action={
          <Button
            kind="primary"
            onClick={() => {
              setResourceType("document");
              setResourceId(docs[0]?.id || "");
              setReason("");
              setShowRequestDrawer(true);
            }}
            className="flex items-center gap-2"
          >
            <KeyRound className="h-4 w-4" />
            <span>Request access</span>
          </Button>
        }
      />

      {error && <Notice tone="error">{error}</Notice>}

      {/* 2. Stat Strip */}
      <section aria-label="Request metrics" className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Pending Review"
          value={pendingRequests.length}
          subtext={isApprover ? "Awaiting your authorization" : "Requests in review"}
          tone={pendingRequests.length > 0 ? "amber" : "default"}
        />
        <StatCard
          label="Approved Grants"
          value={requests.filter((r) => r.decision === "approved").length}
          subtext="Access granted and audited"
          tone="emerald"
        />
        <StatCard
          label="Total Submissions"
          value={requests.length}
          subtext="Recorded in organization audit trail"
        />
      </section>

      {/* 2.5. Section: Your Submitted Requests (Editable) */}
      {myPendingRequests.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h2 className="display text-2xl font-semibold text-ink">
                Your Submitted Requests ({myPendingRequests.length})
              </h2>
              <p className="text-xs text-muted">
                Pending requests submitted by you. You can update your business justification or requested resource before a decision is made.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
            <table className="w-full text-left text-sm hidden md:table">
              <thead className="border-b border-line bg-surface-subtle/70 text-xs text-muted font-mono uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-medium">Resource</th>
                  <th className="px-4 py-3 font-medium">Business Reason</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {myPendingRequests.map((r) => {
                  const timeInfo = formatRelativeTime(r.created_at);
                  return (
                    <tr key={r.id} className="hover:bg-surface-hover/60 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-line px-1.5 py-0.5 text-[0.65rem] font-mono uppercase text-muted">
                            {r.resource_type}
                          </span>
                          <span className="font-semibold text-ink">{r.resource_name}</span>
                        </div>
                        {r.target_user_name && (
                          <p className="text-[0.7rem] text-sky-700 mt-0.5">For: {r.target_user_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted max-w-sm">
                        <p className="truncate">{r.reason}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusPill status="pending" />
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted font-mono" title={timeInfo.full}>
                        {timeInfo.relative}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Button
                          kind="secondary"
                          onClick={() => openEditDrawer(r)}
                          className="flex items-center gap-1.5 text-xs inline-flex"
                        >
                          <Pencil className="h-3.5 w-3.5 text-accent" />
                          <span>Edit Request</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile View */}
            <div className="divide-y divide-line md:hidden">
              {myPendingRequests.map((r) => {
                const timeInfo = formatRelativeTime(r.created_at);
                return (
                  <div key={r.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-ink text-sm">{r.resource_name}</p>
                        <span className="rounded bg-line px-1.5 py-0.5 text-[0.65rem] font-mono uppercase text-muted">
                          {r.resource_type}
                        </span>
                      </div>
                      <StatusPill status="pending" />
                    </div>
                    <p className="text-xs text-muted">{r.reason}</p>
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[0.7rem] text-muted font-mono">{timeInfo.relative}</span>
                      <Button
                        kind="secondary"
                        onClick={() => openEditDrawer(r)}
                        className="flex items-center gap-1.5 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5 text-accent" />
                        <span>Edit</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 3. Section 1: Needs Your Review */}
      {isApprover && (
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h2 className="display text-2xl font-semibold text-ink">
                Needs your review ({pendingRequests.length})
              </h2>
              <p className="text-xs text-muted">
                Pending requests requiring clearance or role elevation review.
              </p>
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={3} />
          ) : pendingRequests.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface p-8 text-center text-xs text-muted">
              Nothing waiting for review. All requests are up to date.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
              <table className="w-full text-left text-sm hidden md:table">
                <thead className="border-b border-line bg-surface-subtle/70 text-xs text-muted font-mono uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 font-medium">Requester</th>
                    <th className="px-4 py-3 font-medium">Resource</th>
                    <th className="px-4 py-3 font-medium">Business Reason</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium text-right">Review Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pendingRequests.map((r) => {
                    const timeInfo = formatRelativeTime(r.created_at);
                    const canEdit = r.requester_id === user?.id || user?.is_admin;
                    return (
                      <tr key={r.id} className="hover:bg-surface-hover/60 transition-colors">
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-ink text-sm">{r.requester_name}</p>
                          {r.target_user_name && (
                            <p className="text-[0.7rem] text-sky-700">For: {r.target_user_name}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded bg-line px-1.5 py-0.5 text-[0.65rem] font-mono uppercase text-muted">
                              {r.resource_type}
                            </span>
                            <span className="font-medium text-ink">{r.resource_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted max-w-xs truncate">
                          {r.reason}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted font-mono" title={timeInfo.full}>
                          {timeInfo.relative}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canEdit && (
                              <Button
                                kind="secondary"
                                onClick={() => openEditDrawer(r)}
                                className="flex items-center gap-1 text-xs"
                              >
                                <Pencil className="h-3.5 w-3.5 text-accent" />
                                <span>Edit</span>
                              </Button>
                            )}
                            <Button
                              kind="secondary"
                              onClick={() => {
                                setReviewTarget(r);
                                setDecisionNote("");
                              }}
                            >
                              Review
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile View */}
              <div className="divide-y divide-line md:hidden">
                {pendingRequests.map((r) => {
                  const canEdit = r.requester_id === user?.id || user?.is_admin;
                  return (
                    <div key={r.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-ink text-sm">{r.requester_name}</p>
                          <p className="text-xs text-accent">{r.resource_name}</p>
                        </div>
                        <StatusPill status="pending" />
                      </div>
                      <p className="text-xs text-muted">{r.reason}</p>
                      <div className="flex justify-end gap-2 pt-2">
                        {canEdit && (
                          <Button
                            kind="secondary"
                            onClick={() => openEditDrawer(r)}
                            className="flex items-center gap-1 text-xs"
                          >
                            <Pencil className="h-3.5 w-3.5 text-accent" />
                            <span>Edit</span>
                          </Button>
                        )}
                        <Button
                          kind="secondary"
                          onClick={() => {
                            setReviewTarget(r);
                            setDecisionNote("");
                          }}
                        >
                          Review request
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 4. Section 2: Request History */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div>
            <h2 className="display text-2xl font-semibold text-ink">
              Request History ({requests.length})
            </h2>
            <p className="text-xs text-muted">
              Past access approvals and decisions across the tenant.
            </p>
          </div>

          <div className="flex gap-1 text-xs">
            <button
              onClick={() => setHistoryFilter("all")}
              className={`rounded-full px-3 py-1 transition-colors ${
                historyFilter === "all"
                  ? "bg-ink font-medium text-white shadow-xs"
                  : "border border-line bg-surface text-muted hover:text-ink"
              }`}
            >
              All Decisions
            </button>
            <button
              onClick={() => setHistoryFilter("approved")}
              className={`rounded-full px-3 py-1 transition-colors ${
                historyFilter === "approved"
                  ? "bg-allow text-white font-medium shadow-xs"
                  : "border border-line bg-surface text-muted hover:text-allow"
              }`}
            >
              Approved
            </button>
            <button
              onClick={() => setHistoryFilter("rejected")}
              className={`rounded-full px-3 py-1 transition-colors ${
                historyFilter === "rejected"
                  ? "bg-deny text-white font-medium shadow-xs"
                  : "border border-line bg-surface text-muted hover:text-deny"
              }`}
            >
              Rejected
            </button>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={4} />
        ) : pastRequests.length === 0 ? (
          <EmptyState
            title="No past access requests"
            description="Access requests submitted by your team will appear here in the history log."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
            <table className="w-full text-left text-sm hidden md:table">
              <thead className="border-b border-line bg-surface-subtle/70 text-xs text-muted font-mono uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-medium">Target Resource</th>
                  <th className="px-4 py-3 font-medium">Requester</th>
                  <th className="px-4 py-3 font-medium">Business Reason</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Decided By</th>
                  <th className="px-4 py-3 font-medium text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pastRequests.map((r) => {
                  const timeInfo = formatRelativeTime(r.created_at);
                  return (
                    <tr key={r.id} className="hover:bg-surface-hover/60 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-line px-1.5 py-0.5 text-[0.65rem] font-mono uppercase text-muted">
                            {r.resource_type}
                          </span>
                          <span className="font-semibold text-ink">{r.resource_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-ink font-medium">
                        {r.requester_name}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted max-w-sm">
                        <p className="truncate">{r.reason}</p>
                        {r.decision_note && (
                          <span className="block mt-0.5 text-[0.7rem] text-ink font-mono font-medium">
                            Note: {r.decision_note}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusPill status={r.decision} />
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted">
                        {r.approver_name || "System"}
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs text-muted font-mono" title={timeInfo.full}>
                        {timeInfo.relative}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile View */}
            <div className="divide-y divide-line md:hidden">
              {pastRequests.map((r) => {
                const timeInfo = formatRelativeTime(r.created_at);
                return (
                  <div key={r.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-ink text-sm">{r.resource_name}</p>
                        <p className="text-xs text-muted font-mono">{r.requester_name}</p>
                      </div>
                      <StatusPill status={r.decision} />
                    </div>
                    <p className="text-xs text-muted">{r.reason}</p>
                    <p className="text-[0.7rem] text-muted font-mono" title={timeInfo.full}>
                      {timeInfo.relative} • Decided by: {r.approver_name || "System"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* DRAWERS */}

      {/* 5. Submit Access Request Drawer */}
      <Drawer
        isOpen={showRequestDrawer}
        onClose={() => setShowRequestDrawer(false)}
        title="Submit Access Request"
        subtitle="Request access to a confidential document or role membership with business justification."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {canDelegate && (
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Request on Behalf of (Delegated Request)
              </label>
              <select
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
              >
                <option value="">Myself ({user?.name})</option>
                {users
                  .filter((u) => u.id !== user?.id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.roles.join(", ")} • Clearance L{u.clearance})
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-ink mb-1">Resource Type</label>
            <select
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
            >
              <option value="document">Document Access</option>
              <option value="role">Role Membership</option>
              <option value="clearance">Clearance Elevation</option>
            </select>
          </div>

          {resourceType === "document" ? (
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Select Document *</label>
              <select
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                required
              >
                <option value="">Choose a document...</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.classification_label})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Resource Name or Identifier *
              </label>
              <input
                type="text"
                placeholder="e.g. finance or Level 2 Confidential"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              Business Justification *
            </label>
            <textarea
              required
              rows={4}
              placeholder="Explain why you need access to this resource (e.g. 'Need the leave policy to plan vacation and understand annual carry-over rules')..."
              className="w-full rounded-xl border border-line bg-surface p-3 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none min-h-[100px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-[0.7rem] text-muted mt-1">
              Justifications are recorded in the audit log.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              kind="secondary"
              onClick={() => setShowRequestDrawer(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !reason.trim()}>
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* 6. Review Access Request Drawer */}
      <Drawer
        isOpen={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        title="Review Access Request"
        subtitle={reviewTarget ? `Submitted by ${reviewTarget.requester_name}` : undefined}
      >
        {reviewTarget && (
          <div className="space-y-5 text-xs sm:text-sm">
            <div className="rounded-xl border border-line bg-surface p-4 space-y-2.5">
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Requester:</span>
                <strong className="text-ink">{reviewTarget.requester_name}</strong>
              </div>
              {reviewTarget.target_user_name && (
                <div className="flex justify-between py-1 border-b border-line">
                  <span className="text-muted">Beneficiary:</span>
                  <strong className="text-sky-700">{reviewTarget.target_user_name}</strong>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Requested Resource:</span>
                <span className="font-semibold text-ink">{reviewTarget.resource_name} ({reviewTarget.resource_type})</span>
              </div>
              <div className="py-1">
                <span className="text-muted block">Justification Reason:</span>
                <p className="mt-1 text-ink bg-surface-subtle p-2.5 rounded-lg text-xs leading-relaxed">
                  "{reviewTarget.reason}"
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Decision Note / Rationale (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Approved for project engagement duration"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                disabled={reviewBusy}
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-line">
              <Button
                type="button"
                kind="secondary"
                onClick={() => setReviewTarget(null)}
                disabled={reviewBusy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                kind="danger"
                onClick={() => handleDecision("rejected")}
                disabled={reviewBusy}
              >
                {reviewBusy ? "Saving..." : "Reject"}
              </Button>
              <Button
                type="button"
                kind="primary"
                onClick={() => handleDecision("approved")}
                disabled={reviewBusy}
              >
                {reviewBusy ? "Saving..." : "Approve & Grant Access"}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* 7. Edit Access Request Drawer */}
      <Drawer
        isOpen={showEditDrawer}
        onClose={() => {
          setShowEditDrawer(false);
          setEditTarget(null);
        }}
        title="Edit Access Request"
        subtitle={editTarget ? `Modify pending request for ${editTarget.resource_name}` : undefined}
      >
        <form onSubmit={handleEdit} className="space-y-4">
          {canDelegate && (
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Request on Behalf of (Delegated Request)
              </label>
              <select
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                value={editTargetUserId}
                onChange={(e) => setEditTargetUserId(e.target.value)}
              >
                <option value="">Myself ({user?.name})</option>
                {users
                  .filter((u) => u.id !== user?.id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.roles.join(", ")} • Clearance L{u.clearance})
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-ink mb-1">Resource Type</label>
            <select
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              value={editResourceType}
              onChange={(e) => setEditResourceType(e.target.value)}
            >
              <option value="document">Document Access</option>
              <option value="role">Role Membership</option>
              <option value="clearance">Clearance Elevation</option>
            </select>
          </div>

          {editResourceType === "document" ? (
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Select Document *</label>
              <select
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                value={editResourceId}
                onChange={(e) => setEditResourceId(e.target.value)}
                required
              >
                <option value="">Choose a document...</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.classification_label})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Resource Name or Identifier *
              </label>
              <input
                type="text"
                placeholder="e.g. finance or Level 2 Confidential"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                value={editResourceId}
                onChange={(e) => setEditResourceId(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              Business Justification *
            </label>
            <textarea
              required
              rows={4}
              placeholder="Explain why you need access to this resource..."
              className="w-full rounded-xl border border-line bg-surface p-3 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none min-h-[100px]"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
            />
            <p className="text-[0.7rem] text-muted mt-1">
              Updated justifications are recorded in the security audit trail and visible to approvers.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              kind="secondary"
              onClick={() => {
                setShowEditDrawer(false);
                setEditTarget(null);
              }}
              disabled={editSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={editSubmitting || !editReason.trim()}>
              {editSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
