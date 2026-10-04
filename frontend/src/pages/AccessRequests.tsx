import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { inputClass } from "../components/ui/field";
import { useAuth } from "../context/AuthContext";
import { api, patch, post } from "../lib/api";
import type { AccessRequest, Doc, User } from "../lib/types";
import { hasPermission } from "../lib/types";

export default function AccessRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Request modal
  const [showModal, setShowModal] = useState(false);
  const [resourceType, setResourceType] = useState("document");
  const [resourceId, setResourceId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Review modal
  const [reviewTarget, setReviewTarget] = useState<AccessRequest | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  const isApprover = hasPermission(user, "role.assign") || hasPermission(user, "document.grant.manage") || hasPermission(user, "tenant.manage");
  const canDelegate = user?.roles?.some((r) => ["team_lead", "department_manager", "admin", "organization_owner", "iam_admin"].includes(r)) || user?.is_admin;

  const loadData = () => {
    api<AccessRequest[]>("/access-requests").then(setRequests).catch((e) => setError(e.message));
    api<Doc[]>("/documents").then(setDocs).catch(() => {});
    api<User[]>("/users").then(setUsers).catch(() => {});
  };

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(""); setNotice("");
    try {
      await post("/access-requests", {
        resource_type: resourceType,
        resource_id: resourceId.trim() || null,
        reason: reason.trim(),
        target_user_id: targetUserId || undefined,
      });
      setNotice("Access request submitted successfully.");
      setShowModal(false);
      setReason(""); setResourceId(""); setTargetUserId("");
      loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecision(decision: "approved" | "rejected") {
    if (!reviewTarget) return;
    setError(""); setNotice("");
    try {
      await patch(`/access-requests/${reviewTarget.id}`, {
        decision,
        decision_note: decisionNote.trim() || undefined,
      });
      setNotice(`Request ${reviewTarget.id} was ${decision}.`);
      setReviewTarget(null);
      setDecisionNote("");
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const pendingRequests = requests.filter((r) => r.decision === "pending");
  const pastRequests = requests.filter((r) => r.decision !== "pending");

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader title="Access Requests">
          Request access to confidential collections with business justification, or approve requests if authorized.
        </PageHeader>
        <Button onClick={() => setShowModal(true)}>+ Request Access</Button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="info">{notice}</Notice>}

      {isApprover && pendingRequests.length > 0 && (
        <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h2 className="display text-2xl text-amber-700">Pending Review ({pendingRequests.length})</h2>
            <span className="text-xs text-muted">Delegated Approver Queue</span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Requester</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Resource</th>
                  <th className="px-4 py-2.5 font-medium">Justification</th>
                  <th className="px-4 py-2.5 font-medium">Requested</th>
                  <th className="px-4 py-2.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pendingRequests.map((r) => (
                  <tr key={r.id} className="hover:bg-white/40">
                    <td className="px-4 py-3 font-medium text-ink">
                      {r.requester_name}
                      {r.target_user_name && (
                        <span className="block text-[0.7rem] font-normal text-sky-700">For: {r.target_user_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize text-xs text-muted">{r.resource_type}</td>
                    <td className="px-4 py-3 font-medium text-ink">{r.resource_name}</td>
                    <td className="px-4 py-3 text-xs text-ink/80 max-w-xs truncate">{r.reason}</td>
                    <td className="px-4 py-3 text-xs text-muted">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <Button kind="secondary" onClick={() => { setReviewTarget(r); setDecisionNote(""); }}>
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="display text-2xl">Request History ({requests.length})</h2>
        {requests.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No access requests submitted yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Target Resource</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Reason</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Decided By</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium text-ink">
                      {r.resource_name}
                      {r.target_user_name && (
                        <span className="block text-[0.7rem] font-normal text-sky-700">Beneficiary: {r.target_user_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize text-xs text-muted">{r.resource_type}</td>
                    <td className="px-4 py-3 text-xs text-muted max-w-sm">
                      {r.reason}
                      {r.decision_note && (
                        <span className="block mt-0.5 text-[0.7rem] text-ink font-medium">Note: {r.decision_note}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        r.decision === "approved" ? "bg-emerald-100 text-emerald-800" :
                        r.decision === "rejected" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {r.decision}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{r.approver_name || "-"}</td>
                    <td className="px-4 py-3 text-xs text-muted">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* New Request Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-xl">
            <h3 className="display text-2xl">Submit Access Request</h3>
            <p className="mt-1 text-xs text-muted">Access grants are recorded and audited with strict justification.</p>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              {canDelegate && (
                <label className="block text-sm font-medium">Request On Behalf Of (Team Lead / Admin)
                  <select className={`${inputClass} mt-1`} value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
                    <option value="">Myself ({user?.name})</option>
                    {users.filter((u) => u.id !== user?.id).map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block text-sm font-medium">Resource Type
                <select className={`${inputClass} mt-1`} value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
                  <option value="document">Document Access</option>
                  <option value="role">Role Membership</option>
                  <option value="clearance">Clearance Elevation</option>
                </select>
              </label>

              {resourceType === "document" ? (
                <label className="block text-sm font-medium">Target Document
                  <select className={`${inputClass} mt-1`} value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
                    <option value="">Select a document…</option>
                    {docs.map((d) => (
                      <option key={d.id} value={d.id}>{d.title} ({d.classification_label})</option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="block text-sm font-medium">Target Resource Name or ID
                  <input placeholder="e.g. finance or Level 2" className={`${inputClass} mt-1`} value={resourceId} onChange={(e) => setResourceId(e.target.value)} />
                </label>
              )}

              <label className="block text-sm font-medium">Business Justification
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why you need access to this resource…"
                  className={`${inputClass} mt-1`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <Button kind="secondary" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting || !reason.trim()}>Submit Request</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Decision Review Modal */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-xl">
            <h3 className="display text-2xl">Review Access Request</h3>
            <div className="mt-3 rounded bg-surface p-3 text-xs space-y-1.5">
              <p><strong>Requester:</strong> {reviewTarget.requester_name}</p>
              {reviewTarget.target_user_name && (
                <p className="text-sky-700"><strong>Beneficiary:</strong> {reviewTarget.target_user_name}</p>
              )}
              <p><strong>Resource:</strong> {reviewTarget.resource_name} ({reviewTarget.resource_type})</p>
              <p><strong>Reason:</strong> {reviewTarget.reason}</p>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium">Decision Note (Optional)
                <input
                  placeholder="e.g. Approved for project duration"
                  className={`${inputClass} mt-1`}
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button kind="secondary" onClick={() => setReviewTarget(null)}>Cancel</Button>
              <Button kind="danger" onClick={() => handleDecision("rejected")}>Reject</Button>
              <Button onClick={() => handleDecision("approved")}>Approve & Grant</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
