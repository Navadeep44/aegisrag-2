import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Copy,
  ExternalLink,
  Plus,
  Check,
  UserPlus,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { Globe as GlobeIcon } from "lucide-react";

import { inputClass } from "../components/ui/field";
import { useToast } from "../components/ui/Toast";
import { api, post } from "../lib/api";
import type { RoleHubItem } from "../lib/types";

export default function RolePortalsHub() {
  const { showToast } = useToast();

  const [roles, setRoles] = useState<RoleHubItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Add Custom Role Dialog
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRoleClearance, setNewRoleClearance] = useState(1);
  const [submittingRole, setSubmittingRole] = useState(false);

  // Assign User to Role Dialog
  const [assignRoleTarget, setAssignRoleTarget] = useState<RoleHubItem | null>(null);
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberPassword, setMemberPassword] = useState("");
  const [submittingMember, setSubmittingMember] = useState(false);

  const loadRoles = () => {
    setLoading(true);
    api<{ roles: RoleHubItem[] }>("/tenant/roles-hub")
      .then((data) => setRoles(data.roles || []))
      .catch((err) => showToast((err as Error).message, "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const handleCopyLink = (roleSlug: string, portalUrl: string) => {
    const fullUrl = `${window.location.origin}${portalUrl}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedSlug(roleSlug);
      showToast(`Copied role portal link: ${fullUrl}`, "success");
      setTimeout(() => setCopiedSlug(null), 2500);
    });
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setSubmittingRole(true);
    try {
      await post("/tenant/roles", {
        name: newRoleName.trim(),
        description: newRoleDesc.trim(),
        default_clearance: Number(newRoleClearance),
      });
      showToast(`Role '${newRoleName}' created successfully!`, "success");
      setShowAddRoleModal(false);
      setNewRoleName("");
      setNewRoleDesc("");
      loadRoles();
    } catch (err) {
      showToast((err as Error).message || "Failed to create role", "error");
    } finally {
      setSubmittingRole(false);
    }
  };

  const handleAssignMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignRoleTarget) return;
    setSubmittingMember(true);
    try {
      await post(`/tenant/roles/${assignRoleTarget.id}/assign-user`, {
        name: memberName.trim(),
        email: memberEmail.trim().toLowerCase(),
        password: memberPassword,
        clearance: assignRoleTarget.default_clearance,
      });
      showToast(`Assigned ${memberName} to ${assignRoleTarget.name}!`, "success");
      setAssignRoleTarget(null);
      setMemberName("");
      setMemberEmail("");
      setMemberPassword("");
      loadRoles();
    } catch (err) {
      showToast((err as Error).message || "Failed to assign member", "error");
    } finally {
      setSubmittingMember(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        icon={GlobeIcon}
        title="Role Portals & Team Assignment"
        subtitle="One sign-in link per role."
        action={
          <Button onClick={() => setShowAddRoleModal(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Custom Role
          </Button>
        }
      />

      {/* Roles Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 rounded-xl border border-line bg-surface animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {roles.map((role) => {
            const isCopied = copiedSlug === role.slug;
            return (
              <div
                key={role.id}
                className="rounded-xl border border-line bg-surface p-5 shadow-xs flex flex-col justify-between hover:border-line-strong transition-colors"
              >
                <div>
                  {/* Role Header */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-base text-ink">{role.name}</h3>
                        {role.is_system && (
                          <span className="rounded bg-line/60 px-1.5 py-0.5 text-[0.65rem] font-medium text-muted">
                            System
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-1 leading-relaxed">
                        {role.description || "Specialized operational role."}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider ${
                        role.clearance_label.toLowerCase() === "restricted"
                          ? "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                          : role.clearance_label.toLowerCase() === "confidential"
                          ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                          : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                      }`}
                    >
                      {role.clearance_label} (L{role.default_clearance})
                    </span>
                  </div>

                  {/* Portal URL Box */}
                  <div className="my-4 rounded-lg border border-line/80 bg-surface-hover/60 p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[0.68rem] uppercase font-semibold tracking-wider text-muted mb-0.5">
                        Dedicated Portal URL
                      </div>
                      <code className="text-xs font-mono text-ink truncate block">
                        {window.location.origin}{role.portal_url}
                      </code>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(role.slug, role.portal_url)}
                        title="Copy Portal Link"
                        className="rounded-md border border-line bg-surface p-1.5 text-muted hover:text-ink hover:border-ink transition-colors"
                      >
                        {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <Link
                        to={role.portal_url}
                        target="_blank"
                        rel="noreferrer"
                        title="Open Portal in New Tab"
                        className="rounded-md border border-line bg-surface p-1.5 text-muted hover:text-ink hover:border-ink transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>

                  {/* Assigned Members Section */}
                  <div className="border-t border-line/70 pt-3">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-medium text-muted">
                        Assigned Personnel ({role.users?.length || 0})
                      </span>
                      <button
                        type="button"
                        onClick={() => setAssignRoleTarget(role)}
                        className="text-accent hover:underline flex items-center gap-1 font-semibold text-[0.75rem]"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>Assign Member</span>
                      </button>
                    </div>

                    {role.users && role.users.length > 0 ? (
                      <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                        {role.users.map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center justify-between gap-2 rounded-md bg-surface-hover/40 px-2 py-1 text-[0.75rem]"
                          >
                            <span className="font-medium text-ink truncate">{u.name}</span>
                            <span className="text-muted font-mono text-[0.7rem] truncate">{u.email}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[0.75rem] text-muted italic">No team members assigned yet.</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Custom Role Modal */}
      {showAddRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-ink mb-1">Create Custom Role</h3>
            <p className="text-xs text-muted mb-4">
              Add a specialized position to your company. A dedicated URL will be generated automatically.
            </p>

            <form onSubmit={handleCreateRole} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Role Name <span className="text-deny">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lead Pharmacist, Discovery Counsel"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Role Description
                </label>
                <input
                  type="text"
                  placeholder="Responsibilities & document scope"
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Default Clearance Level
                </label>
                <select
                  value={newRoleClearance}
                  onChange={(e) => setNewRoleClearance(Number(e.target.value))}
                  className={inputClass}
                >
                  <option value={0}>Level 0 — Public</option>
                  <option value={1}>Level 1 — Internal</option>
                  <option value={2}>Level 2 — Confidential</option>
                  <option value={3}>Level 3 — Restricted</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button type="button" kind="secondary" onClick={() => setShowAddRoleModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submittingRole}>
                  {submittingRole ? "Creating..." : "Create Role"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Member Modal */}
      {assignRoleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-ink mb-1">
              Assign Personnel to {assignRoleTarget.name}
            </h3>
            <p className="text-xs text-muted mb-4">
              Create login credentials for this team member. They can sign in directly through the role portal.
            </p>

            <form onSubmit={handleAssignMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Full Name <span className="text-deny">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Alex Mercer, John Doe"
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Email / Username <span className="text-deny">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Password <span className="text-deny">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••••••••"
                  value={memberPassword}
                  onChange={(e) => setMemberPassword(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button type="button" kind="secondary" onClick={() => setAssignRoleTarget(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submittingMember}>
                  {submittingMember ? "Saving..." : "Assign Personnel"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
