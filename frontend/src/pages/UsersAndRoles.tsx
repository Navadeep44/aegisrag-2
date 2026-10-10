import { useEffect, useState } from "react";
import {
  UserPlus,
  Shield,
  Building2,
  UserCheck,
  MoreVertical,
  Eye,
  Sliders,
  UserMinus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Users as UsersIcon } from "lucide-react";
import { Button } from "../components/ui/Button";
import { StatCard } from "../components/ui/StatCard";
import { TableSkeleton } from "../components/ui/Skeleton";
import { Notice } from "../components/ui/Notice";
import { Drawer } from "../components/ui/Drawer";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ClearancePill, RolePill, StatusPill } from "../components/ui/StatusPill";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ui/Toast";
import { api, patch, post } from "../lib/api";
import type { Department, Role, User } from "../lib/types";
import { hasPermission } from "../lib/types";

export default function UsersAndRoles() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const isHrOnly =
    user?.roles?.includes("hr") &&
    !user?.roles?.includes("admin") &&
    !user?.roles?.includes("iam_admin") &&
    !user?.is_admin;

  const [activeTab, setActiveTab] = useState<"users" | "roles" | "departments" | "hr">(
    isHrOnly ? "hr" : "users"
  );
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Drawers & Modals
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  const [showRoleDrawer, setShowRoleDrawer] = useState<Role | "new" | null>(null);
  const [showAssignDrawer, setShowAssignDrawer] = useState<User | null>(null);
  const [showEffectiveDrawer, setShowEffectiveDrawer] = useState<{
    user: User;
    count: number;
    perms: string[];
  } | null>(null);
  const [showDeptDrawer, setShowDeptDrawer] = useState(false);
  const [showOnboardDrawer, setShowOnboardDrawer] = useState(false);

  // Deactivation confirmation dialog
  const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null);
  const [deactivateBusy, setDeactivateBusy] = useState(false);

  // Forms
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteClearance, setInviteClearance] = useState(1);
  const [inviteDept, setInviteDept] = useState("");
  const [inviteRoles, setInviteRoles] = useState<string[]>(["employee"]);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const [newDeptName, setNewDeptName] = useState("");
  const [deptSubmitting, setDeptSubmitting] = useState(false);

  const [onboardName, setOnboardName] = useState("");
  const [onboardEmail, setOnboardEmail] = useState("");
  const [onboardClearance, setOnboardClearance] = useState(1);
  const [onboardDept, setOnboardDept] = useState("");
  const [onboardRole, setOnboardRole] = useState("employee");
  const [onboardSubmitting, setOnboardSubmitting] = useState(false);

  const [roleName, setRoleName] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [roleSubmitting, setRoleSubmitting] = useState(false);

  const [assignRolesList, setAssignRolesList] = useState<string[]>([]);
  const [assignClearance, setAssignClearance] = useState(1);
  const [assignDept, setAssignDept] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const canInvite = hasPermission(user, "user.invite");
  const canDeactivate = hasPermission(user, "user.deactivate");
  const canAssign = hasPermission(user, "role.assign");
  const canManageRoles = hasPermission(user, "role.manage");
  const isHrAdmin = user?.roles?.includes("hr") || user?.roles?.includes("admin") || user?.is_admin;
  const isOrgAdmin =
    user?.roles?.includes("admin") ||
    user?.roles?.includes("organization_owner") ||
    user?.is_platform_admin;

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api<User[]>("/users").then(setUsers),
      api<Role[]>("/roles").then(setRoles),
      api<Department[]>("/departments").then(setDepartments),
      api<string[]>("/permissions").then(setPermissions),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    if (isHrOnly) setActiveTab("hr");
  }, [user]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteSubmitting(true);
    try {
      await post("/users/invite", {
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        roles: inviteRoles,
        clearance: Number(inviteClearance),
        department_id: inviteDept || undefined,
      });
      showToast(`Invitation sent to ${inviteEmail}.`, "success");
      setShowInviteDrawer(false);
      setInviteEmail("");
      setInviteName("");
      loadData();
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setInviteSubmitting(false);
    }
  }

  async function confirmToggleStatus() {
    if (!deactivatingUser) return;
    setDeactivateBusy(true);
    const newStatus = deactivatingUser.status === "active" ? "deactivated" : "active";
    try {
      await patch(`/users/${deactivatingUser.id}/status`, { status: newStatus });
      showToast(
        `${deactivatingUser.name} is now ${newStatus === "active" ? "active" : "deactivated"}.`,
        "success"
      );
      setDeactivatingUser(null);
      loadData();
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setDeactivateBusy(false);
    }
  }

  async function handleAssignRoles(e: React.FormEvent) {
    e.preventDefault();
    if (!showAssignDrawer) return;
    setAssignSubmitting(true);
    try {
      await post(`/users/${showAssignDrawer.id}/roles`, {
        roles: assignRolesList,
        clearance: Number(assignClearance),
        department_id: assignDept || undefined,
      });
      showToast(`Security roles updated for ${showAssignDrawer.name}.`, "success");
      setShowAssignDrawer(null);
      loadData();
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setAssignSubmitting(false);
    }
  }

  async function viewEffectiveAccess(target: User) {
    try {
      const res = await api<{
        user: User;
        readable_document_count: number;
        permissions: string[];
      }>(`/users/${target.id}/effective-access`);
      setShowEffectiveDrawer({
        user: res.user,
        count: res.readable_document_count,
        perms: res.permissions,
      });
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }

  async function handleSaveRole(e: React.FormEvent) {
    e.preventDefault();
    setRoleSubmitting(true);
    try {
      if (showRoleDrawer === "new") {
        await post("/roles", { name: roleName.trim(), permission_keys: selectedPerms });
        showToast(`Custom role "${roleName}" created.`, "success");
      } else if (showRoleDrawer && typeof showRoleDrawer === "object") {
        await patch(`/roles/${showRoleDrawer.id}`, { permission_keys: selectedPerms });
        showToast(`Role "${showRoleDrawer.name}" updated.`, "success");
      }
      setShowRoleDrawer(null);
      setRoleName("");
      setSelectedPerms([]);
      loadData();
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setRoleSubmitting(false);
    }
  }

  async function handleCreateDept(e: React.FormEvent) {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    setDeptSubmitting(true);
    try {
      await post("/departments", { name: newDeptName.trim() });
      showToast(`Department "${newDeptName.trim()}" created.`, "success");
      setShowDeptDrawer(false);
      setNewDeptName("");
      loadData();
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setDeptSubmitting(false);
    }
  }

  async function handleHrOnboard(e: React.FormEvent) {
    e.preventDefault();
    setOnboardSubmitting(true);
    try {
      await post("/hr/onboard", {
        name: onboardName.trim(),
        email: onboardEmail.trim(),
        department_id: onboardDept || null,
        clearance: Number(onboardClearance),
        role_name: onboardRole,
      });
      showToast(`Employee ${onboardName} onboarded successfully.`, "success");
      setShowOnboardDrawer(false);
      setOnboardName("");
      setOnboardEmail("");
      loadData();
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setOnboardSubmitting(false);
    }
  }

  // Get user's initials
  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Page Header with single primary action & clean action buttons */}
      <PageHeader
        icon={UsersIcon}
        title="People & Roles"
        subtitle="People, clearance and role bundles."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canInvite && (
              <Button
                kind="primary"
                onClick={() => {
                  setInviteEmail("");
                  setInviteName("");
                  setInviteRoles(["employee"]);
                  setShowInviteDrawer(true);
                }}
                className="flex items-center gap-2"
              >
                <UserPlus className="h-4 w-4" />
                <span>Invite user</span>
              </Button>
            )}

            {canManageRoles && (
              <Button
                kind="secondary"
                onClick={() => {
                  setRoleName("");
                  setSelectedPerms([]);
                  setShowRoleDrawer("new");
                }}
              >
                + Role builder
              </Button>
            )}

            {isOrgAdmin && (
              <Button
                kind="secondary"
                onClick={() => {
                  setNewDeptName("");
                  setShowDeptDrawer(true);
                }}
              >
                + Add department
              </Button>
            )}

            {isHrAdmin && (
              <Button
                kind="secondary"
                onClick={() => {
                  setOnboardName("");
                  setOnboardEmail("");
                  setOnboardClearance(1);
                  setShowOnboardDrawer(true);
                }}
              >
                + Onboard employee
              </Button>
            )}
          </div>
        }
      />

      {error && <Notice tone="error">{error}</Notice>}

      {/* 2. Underline Tab Bar */}
      <div className="flex border-b border-line gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab("users")}
          className={`pb-3 transition-colors border-b-2 ${
            activeTab === "users"
              ? "border-ink text-ink font-semibold"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          Users ({users.length})
        </button>
        <button
          onClick={() => setActiveTab("roles")}
          className={`pb-3 transition-colors border-b-2 ${
            activeTab === "roles"
              ? "border-ink text-ink font-semibold"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          Roles & Permissions ({roles.length})
        </button>
        <button
          onClick={() => setActiveTab("departments")}
          className={`pb-3 transition-colors border-b-2 ${
            activeTab === "departments"
              ? "border-ink text-ink font-semibold"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          Departments ({departments.length})
        </button>
        {(isHrAdmin || isOrgAdmin) && (
          <button
            onClick={() => setActiveTab("hr")}
            className={`pb-3 transition-colors border-b-2 ${
              activeTab === "hr"
                ? "border-ink text-ink font-semibold"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            HR Lifecycle
          </button>
        )}
      </div>

      {loading && <TableSkeleton rows={5} />}

      {/* 3. TAB 1: Users Directory */}
      {!loading && activeTab === "users" && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
          <table className="w-full text-left text-sm hidden md:table">
            <thead className="border-b border-line bg-surface-subtle/70 text-xs text-muted font-mono uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">User Profile</th>
                <th className="px-4 py-3 font-medium">Clearance</th>
                <th className="px-4 py-3 font-medium">Roles</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-surface-hover/60 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white font-medium text-xs shadow-xs">
                        {getInitials(u.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-ink text-sm">
                          {u.name} {u.id === user?.id && <span className="text-xs text-accent font-normal">(You)</span>}
                        </p>
                        <p className="text-[0.7rem] text-muted font-mono truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <ClearancePill clearance={u.clearance} label={u.clearance_label} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <RolePill key={r} role={r} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted">
                    {u.department_name || u.department_id || "General"}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusPill status={u.status} />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => viewEffectiveAccess(u)}
                        className="text-accent hover:underline font-medium"
                      >
                        Preview access
                      </button>

                      {canAssign && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowAssignDrawer(u);
                            setAssignRolesList([...u.roles]);
                            setAssignClearance(u.clearance);
                            setAssignDept(u.department_id || "");
                          }}
                          className="text-ink hover:text-accent underline font-medium"
                        >
                          Roles
                        </button>
                      )}

                      {canDeactivate && u.id !== user?.id && (
                        <button
                          type="button"
                          onClick={() => setDeactivatingUser(u)}
                          className={`font-medium underline ${
                            u.status === "active"
                              ? "text-deny hover:text-deny/80"
                              : "text-allow hover:text-allow/80"
                          }`}
                        >
                          {u.status === "active" ? "Deactivate" : "Reactivate"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile Stacked Card View */}
          <div className="divide-y divide-line md:hidden">
            {users.map((u) => (
              <div key={u.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-ink text-sm">{u.name}</h3>
                    <p className="text-xs text-muted font-mono">{u.email}</p>
                  </div>
                  <StatusPill status={u.status} />
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <ClearancePill clearance={u.clearance} label={u.clearance_label} />
                  <span className="text-muted">{u.department_name || "General"}</span>
                </div>
                <div className="flex justify-end gap-3 pt-2 border-t border-line text-xs">
                  <button
                    onClick={() => viewEffectiveAccess(u)}
                    className="text-accent underline font-medium"
                  >
                    Preview access
                  </button>
                  {canAssign && (
                    <button
                      onClick={() => {
                        setShowAssignDrawer(u);
                        setAssignRolesList([...u.roles]);
                        setAssignClearance(u.clearance);
                        setAssignDept(u.department_id || "");
                      }}
                      className="text-ink underline font-medium"
                    >
                      Edit roles
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. TAB 2: Roles & Permissions */}
      {!loading && activeTab === "roles" && (
        <div className="space-y-4">
          <p className="text-xs text-muted">
            Roles bundle fine-grained permission keys. Eyes Only checks permissions centrally at the API and database query level.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {roles.map((r) => (
              <div key={r.id} className="rounded-xl border border-line bg-surface p-5 shadow-xs space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="display text-xl font-semibold text-ink">{r.name}</h3>
                    <p className="text-xs text-muted font-mono">
                      Scope: {r.scope || "tenant"} • {r.is_system ? "System Role" : "Custom Bundle"}
                    </p>
                  </div>
                  {canManageRoles && !r.is_system && (
                    <Button
                      kind="secondary"
                      onClick={() => {
                        setShowRoleDrawer(r);
                        setSelectedPerms(r.permission_keys || []);
                      }}
                    >
                      Edit keys
                    </Button>
                  )}
                </div>

                <div>
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted font-mono mb-1.5">
                    Granted Keys ({r.permission_keys?.length || 0}):
                  </p>
                  <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                    {(r.permission_keys || []).map((p) => (
                      <span
                        key={p}
                        className="rounded border border-line bg-surface-subtle px-1.5 py-0.5 font-mono text-[0.65rem] text-ink"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. TAB 3: Departments */}
      {!loading && activeTab === "departments" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">
              Departments organize teams and define boundary grants for hybrid retrieval access control.
            </p>
            {isOrgAdmin && (
              <Button onClick={() => setShowDeptDrawer(true)}>+ Add department</Button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-subtle/70 text-xs text-muted font-mono uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-medium">Department Name</th>
                  <th className="px-4 py-3 font-medium">Active Members</th>
                  <th className="px-4 py-3 font-medium">Department Code</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {departments.map((d) => (
                  <tr key={d.id} className="hover:bg-surface-hover/60 transition-colors">
                    <td className="px-4 py-3.5 font-semibold text-ink">{d.name}</td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
                        {d.member_count ?? 0} member(s)
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-mono text-muted">{d.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. TAB 4: HR Lifecycle */}
      {!loading && activeTab === "hr" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="display text-2xl font-semibold text-ink">Employee Lifecycle Management</h3>
              <p className="text-xs text-muted">
                Handle employee onboarding, clearance tiers, and offboarding with instant access revocation.
              </p>
            </div>
            {isHrAdmin && (
              <Button onClick={() => setShowOnboardDrawer(true)}>+ Onboard new employee</Button>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-subtle/70 text-xs text-muted font-mono uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Clearance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Lifecycle Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-hover/60 transition-colors">
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-ink">{u.name}</p>
                      <p className="text-xs text-muted font-mono">{u.email}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted">
                      {u.department_name || u.department_id || "General"}
                    </td>
                    <td className="px-4 py-3.5">
                      <ClearancePill clearance={u.clearance} label={u.clearance_label} />
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusPill status={u.status} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {isHrAdmin && u.id !== user?.id && u.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => setDeactivatingUser(u)}
                          className="text-xs text-deny hover:underline font-medium"
                        >
                          Offboard employee
                        </button>
                      ) : (
                        <span className="text-xs text-muted italic">Inactive</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DRAWERS */}

      {/* Invite User Drawer */}
      <Drawer
        isOpen={showInviteDrawer}
        onClose={() => setShowInviteDrawer(false)}
        title="Invite User"
        subtitle="Provision a new team member account with security clearance and role permissions."
      >
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Work Email *</label>
            <input
              type="email"
              required
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.internal"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">Full Name *</label>
            <input
              type="text"
              required
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="e.g. Alex Morgan"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Clearance Tier</label>
              <select
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                value={inviteClearance}
                onChange={(e) => setInviteClearance(Number(e.target.value))}
              >
                <option value={0}>0 — Public</option>
                <option value={1}>1 — Internal</option>
                <option value={2}>2 — Confidential</option>
                <option value={3}>3 — Restricted</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Department</label>
              <select
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                value={inviteDept}
                onChange={(e) => setInviteDept(e.target.value)}
              >
                <option value="">General / Unassigned</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1.5">Assigned Roles</label>
            <div className="flex flex-wrap gap-2 border border-line bg-surface-subtle p-3 rounded-lg max-h-40 overflow-y-auto">
              {roles.map((r) => (
                <label key={r.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inviteRoles.includes(r.name)}
                    onChange={(e) => {
                      if (e.target.checked) setInviteRoles([...inviteRoles, r.name]);
                      else setInviteRoles(inviteRoles.filter((x) => x !== r.name));
                    }}
                  />
                  <span>{r.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              kind="secondary"
              onClick={() => setShowInviteDrawer(false)}
              disabled={inviteSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={inviteSubmitting}>
              {inviteSubmitting ? "Inviting..." : "Send Invitation"}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Assign Roles Drawer */}
      <Drawer
        isOpen={Boolean(showAssignDrawer)}
        onClose={() => setShowAssignDrawer(null)}
        title="Edit Roles & Clearance"
        subtitle={showAssignDrawer ? `${showAssignDrawer.name} (${showAssignDrawer.email})` : undefined}
      >
        {showAssignDrawer && (
          <form onSubmit={handleAssignRoles} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Clearance Level</label>
                <select
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                  value={assignClearance}
                  onChange={(e) => setAssignClearance(Number(e.target.value))}
                >
                  <option value={0}>0 — Public</option>
                  <option value={1}>1 — Internal</option>
                  <option value={2}>2 — Confidential</option>
                  <option value={3}>3 — Restricted</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">Department</label>
                <select
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                  value={assignDept}
                  onChange={(e) => setAssignDept(e.target.value)}
                >
                  <option value="">General / Unassigned</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1.5">Assigned Roles</label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-line bg-surface p-3 rounded-lg">
                {roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignRolesList.includes(r.name) || assignRolesList.includes(r.id)}
                      onChange={(e) => {
                        if (e.target.checked) setAssignRolesList([...assignRolesList, r.name]);
                        else setAssignRolesList(assignRolesList.filter((x) => x !== r.name && x !== r.id));
                      }}
                    />
                    <span>{r.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <Button
                type="button"
                kind="secondary"
                onClick={() => setShowAssignDrawer(null)}
                disabled={assignSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={assignSubmitting}>
                {assignSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        )}
      </Drawer>

      {/* Effective Access Drawer */}
      <Drawer
        isOpen={Boolean(showEffectiveDrawer)}
        onClose={() => setShowEffectiveDrawer(null)}
        title="Effective Access Preview"
        subtitle={showEffectiveDrawer ? `${showEffectiveDrawer.user.name} (${showEffectiveDrawer.user.email})` : undefined}
      >
        {showEffectiveDrawer && (
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="rounded-xl border border-line bg-surface p-4 space-y-2">
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Readable Documents:</span>
                <strong className="text-ink font-mono">{showEffectiveDrawer.count} documents</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Clearance Level:</span>
                <ClearancePill clearance={showEffectiveDrawer.user.clearance} label={showEffectiveDrawer.user.clearance_label} />
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-muted">Active Roles:</span>
                <span className="text-ink font-medium">{showEffectiveDrawer.user.roles.join(", ")}</span>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted font-mono mb-2">
                Active Permission Keys ({showEffectiveDrawer.perms.length}):
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-60 overflow-y-auto">
                {showEffectiveDrawer.perms.map((p) => (
                  <span
                    key={p}
                    className="rounded border border-line bg-surface-subtle px-2 py-1 font-mono text-xs text-ink"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Add Department Drawer */}
      <Drawer
        isOpen={showDeptDrawer}
        onClose={() => setShowDeptDrawer(false)}
        title="Add Department"
        subtitle="Create a departmental unit for grouping colleagues and document boundaries."
      >
        <form onSubmit={handleCreateDept} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Department Name *</label>
            <input
              type="text"
              required
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              placeholder="e.g. Legal, Marketing, Engineering"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              kind="secondary"
              onClick={() => setShowDeptDrawer(false)}
              disabled={deptSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={deptSubmitting || !newDeptName.trim()}>
              {deptSubmitting ? "Creating..." : "Create Department"}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Role Builder Drawer */}
      <Drawer
        isOpen={Boolean(showRoleDrawer)}
        onClose={() => setShowRoleDrawer(null)}
        title={showRoleDrawer === "new" ? "Create Custom Role" : `Edit Role: ${(showRoleDrawer as Role)?.name}`}
        subtitle="Group fine-grained permission keys into a custom role bundle."
      >
        <form onSubmit={handleSaveRole} className="space-y-4">
          {showRoleDrawer === "new" && (
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Role Identifier *</label>
              <input
                type="text"
                required
                placeholder="e.g. security_lead"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-ink mb-1.5">
              Select Permission Keys ({selectedPerms.length} active)
            </label>
            <div className="grid grid-cols-2 gap-2 border border-line bg-surface p-3 rounded-lg max-h-64 overflow-y-auto">
              {permissions.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-xs font-mono cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPerms.includes(p)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedPerms([...selectedPerms, p]);
                      else setSelectedPerms(selectedPerms.filter((x) => x !== p));
                    }}
                  />
                  <span className="truncate">{p}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              kind="secondary"
              onClick={() => setShowRoleDrawer(null)}
              disabled={roleSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={roleSubmitting}>
              {roleSubmitting ? "Saving..." : "Save Role"}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* HR Onboard Drawer */}
      <Drawer
        isOpen={showOnboardDrawer}
        onClose={() => setShowOnboardDrawer(false)}
        title="Onboard New Employee"
        subtitle="Register employee credentials, clearance rating, and department membership."
      >
        <form onSubmit={handleHrOnboard} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Employee Full Name *</label>
            <input
              type="text"
              required
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              placeholder="e.g. Jane Doe"
              value={onboardName}
              onChange={(e) => setOnboardName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">Work Email Address *</label>
            <input
              type="email"
              required
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              placeholder="jane.doe@company.internal"
              value={onboardEmail}
              onChange={(e) => setOnboardEmail(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Initial Clearance</label>
              <select
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                value={onboardClearance}
                onChange={(e) => setOnboardClearance(Number(e.target.value))}
              >
                <option value={1}>1 — Internal</option>
                <option value={2}>2 — Confidential</option>
                <option value={3}>3 — Restricted</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Department</label>
              <select
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                value={onboardDept}
                onChange={(e) => setOnboardDept(e.target.value)}
              >
                <option value="">General / Unassigned</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">Primary Role</label>
            <select
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              value={onboardRole}
              onChange={(e) => setOnboardRole(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button
              type="button"
              kind="secondary"
              onClick={() => setShowOnboardDrawer(false)}
              disabled={onboardSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={onboardSubmitting}>
              {onboardSubmitting ? "Onboarding..." : "Complete Onboarding"}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Deactivate User Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingUser)}
        onClose={() => setDeactivatingUser(null)}
        onConfirm={confirmToggleStatus}
        title={`${deactivatingUser?.status === "active" ? "Deactivate" : "Reactivate"} ${deactivatingUser?.name}?`}
        description={
          deactivatingUser?.status === "active"
            ? "Deactivating this account immediately revokes all authentication tokens and access grants."
            : "Reactivating this account restores active session capabilities and configured clearance permissions."
        }
        confirmText={deactivatingUser?.status === "active" ? "Deactivate Account" : "Reactivate Account"}
        tone={deactivatingUser?.status === "active" ? "danger" : "primary"}
        busy={deactivateBusy}
      />
    </div>
  );
}
