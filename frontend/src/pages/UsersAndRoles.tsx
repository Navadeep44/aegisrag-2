import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { inputClass } from "../components/ui/field";
import { useAuth } from "../context/AuthContext";
import { api, patch, post } from "../lib/api";
import type { Department, Role, User } from "../lib/types";
import { hasPermission } from "../lib/types";

export default function UsersAndRoles() {
  const { user } = useAuth();
  const isHrOnly = user?.roles?.includes("hr") && !user?.roles?.includes("admin") && !user?.roles?.includes("iam_admin") && !user?.is_admin;
  const [activeTab, setActiveTab] = useState<"users" | "roles" | "departments" | "hr">(isHrOnly ? "hr" : "users");
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Modal states
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState<User | null>(null);
  const [showEffectiveModal, setShowEffectiveModal] = useState<{ user: User; count: number; perms: string[] } | null>(null);
  const [showCreateRoleModal, setShowCreateRoleModal] = useState(false);
  const [showEditRoleModal, setShowEditRoleModal] = useState<Role | null>(null);
  const [showCreateDeptModal, setShowCreateDeptModal] = useState(false);
  const [showOnboardModal, setShowOnboardModal] = useState(false);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteClearance, setInviteClearance] = useState(1);
  const [inviteDept, setInviteDept] = useState("");
  const [inviteRoles, setInviteRoles] = useState<string[]>(["employee"]);

  // Department form
  const [newDeptName, setNewDeptName] = useState("");

  // HR Onboard form
  const [onboardName, setOnboardName] = useState("");
  const [onboardEmail, setOnboardEmail] = useState("");
  const [onboardClearance, setOnboardClearance] = useState(1);
  const [onboardDept, setOnboardDept] = useState("");
  const [onboardRole, setOnboardRole] = useState("employee");

  // Role builder form
  const [roleName, setRoleName] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  // Assign roles form
  const [assignRolesList, setAssignRolesList] = useState<string[]>([]);
  const [assignClearance, setAssignClearance] = useState(1);
  const [assignDept, setAssignDept] = useState("");

  const canInvite = hasPermission(user, "user.invite");
  const canDeactivate = hasPermission(user, "user.deactivate");
  const canAssign = hasPermission(user, "role.assign");
  const canManageRoles = hasPermission(user, "role.manage");
  const isHrAdmin = user?.roles?.includes("hr") || user?.roles?.includes("admin") || user?.is_admin;
  const isOrgAdmin = user?.roles?.includes("admin") || user?.roles?.includes("organization_owner") || user?.is_platform_admin;

  const loadData = () => {
    api<User[]>("/users").then(setUsers).catch((e) => setError(e.message));
    api<Role[]>("/roles").then(setRoles).catch(() => {});
    api<Department[]>("/departments").then(setDepartments).catch(() => {});
    api<string[]>("/permissions").then(setPermissions).catch(() => {});
  };

  useEffect(() => {
    loadData();
    if (isHrOnly) setActiveTab("hr");
  }, [user]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setNotice("");
    try {
      await post("/users/invite", {
        email: inviteEmail,
        name: inviteName,
        roles: inviteRoles,
        clearance: Number(inviteClearance),
        department_id: inviteDept,
      });
      setNotice(`User ${inviteEmail} invited successfully.`);
      setShowInviteModal(false);
      setInviteEmail(""); setInviteName("");
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleStatus(target: User) {
    setError(""); setNotice("");
    const newStatus = target.status === "active" ? "deactivated" : "active";
    try {
      await patch(`/users/${target.id}/status`, { status: newStatus });
      setNotice(`User ${target.name} is now ${newStatus}.`);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleAssignRoles(e: React.FormEvent) {
    e.preventDefault();
    if (!showAssignModal) return;
    setError(""); setNotice("");
    try {
      await post(`/users/${showAssignModal.id}/roles`, {
        roles: assignRolesList,
        clearance: Number(assignClearance),
        department_id: assignDept,
      });
      setNotice(`Updated roles for ${showAssignModal.name}.`);
      setShowAssignModal(null);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function viewEffectiveAccess(target: User) {
    try {
      const res = await api<{ user: User; readable_document_count: number; permissions: string[] }>(`/users/${target.id}/effective-access`);
      setShowEffectiveModal({ user: res.user, count: res.readable_document_count, perms: res.permissions });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setNotice("");
    try {
      await post("/roles", { name: roleName, permission_keys: selectedPerms });
      setNotice(`Custom role '${roleName}' created.`);
      setShowCreateRoleModal(false);
      setRoleName(""); setSelectedPerms([]);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleUpdateRole(e: React.FormEvent) {
    e.preventDefault();
    if (!showEditRoleModal) return;
    setError(""); setNotice("");
    try {
      await patch(`/roles/${showEditRoleModal.id}`, { permission_keys: selectedPerms });
      setNotice(`Role '${showEditRoleModal.name}' updated.`);
      setShowEditRoleModal(null);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateDept(e: React.FormEvent) {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    setError(""); setNotice("");
    try {
      await post("/departments", { name: newDeptName.trim() });
      setNotice(`Department "${newDeptName.trim()}" created successfully.`);
      setShowCreateDeptModal(false);
      setNewDeptName("");
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleHrOnboard(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setNotice("");
    try {
      await post("/hr/onboard", {
        name: onboardName.trim(),
        email: onboardEmail.trim(),
        department_id: onboardDept || null,
        clearance: Number(onboardClearance),
        role_name: onboardRole,
      });
      setNotice(`Employee ${onboardName} onboarded successfully.`);
      setShowOnboardModal(false);
      setOnboardName(""); setOnboardEmail("");
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleHrOffboard(target: User) {
    const reason = window.prompt(`Offboard reason for ${target.name}:`, "Contract completed");
    if (!reason) return;
    setError(""); setNotice("");
    try {
      await post("/hr/offboard", { user_id: target.id, reason });
      setNotice(`Employee ${target.name} has been offboarded.`);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader title="Identity & Access Management">
          Manage tenant users, custom role permission bundles, and preview effective permissions.
        </PageHeader>
        <div className="flex flex-wrap gap-2">
          {canInvite && (
            <Button onClick={() => setShowInviteModal(true)}>+ Invite User</Button>
          )}
          {canManageRoles && (
            <Button kind="secondary" onClick={() => { setRoleName(""); setSelectedPerms([]); setShowCreateRoleModal(true); }}>
              + Role Builder
            </Button>
          )}
          {isOrgAdmin && (
            <Button kind="secondary" onClick={() => { setNewDeptName(""); setShowCreateDeptModal(true); }}>
              + Add Department
            </Button>
          )}
          {isHrAdmin && (
            <Button kind="secondary" onClick={() => { setOnboardName(""); setOnboardEmail(""); setOnboardClearance(1); setOnboardRole("employee"); setShowOnboardModal(true); }}>
              + Onboard Employee
            </Button>
          )}
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="info">{notice}</Notice>}

      <div className="flex border-b border-line gap-1">
        <button
          onClick={() => setActiveTab("users")}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === "users" ? "border-ink text-ink font-semibold" : "border-transparent text-muted hover:text-ink"}`}
        >
          Users ({users.length})
        </button>
        <button
          onClick={() => setActiveTab("roles")}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === "roles" ? "border-ink text-ink font-semibold" : "border-transparent text-muted hover:text-ink"}`}
        >
          Roles & Permissions ({roles.length})
        </button>
        <button
          onClick={() => setActiveTab("departments")}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === "departments" ? "border-ink text-ink font-semibold" : "border-transparent text-muted hover:text-ink"}`}
        >
          Departments ({departments.length})
        </button>
        {(isHrAdmin || isOrgAdmin) && (
          <button
            onClick={() => setActiveTab("hr")}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === "hr" ? "border-ink text-ink font-semibold" : "border-transparent text-muted hover:text-ink"}`}
          >
            HR Lifecycle & Offboarding
          </button>
        )}
      </div>

      {activeTab === "users" && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-line/20 text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Roles</th>
                <th className="px-4 py-3 font-medium">Clearance</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-white/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{u.name}</p>
                    <p className="text-xs text-muted font-mono">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <span key={r} className="rounded bg-line px-1.5 py-0.5 text-[0.7rem] font-medium text-ink">
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-ink">{u.clearance_label}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{u.department_name || u.department_id || "General"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${u.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => viewEffectiveAccess(u)}
                        className="text-xs text-accent underline underline-offset-2 hover:opacity-80"
                      >
                        Preview Access
                      </button>
                      {canAssign && (
                        <button
                          onClick={() => {
                            setShowAssignModal(u);
                            setAssignRolesList([...u.roles]);
                            setAssignClearance(u.clearance);
                            setAssignDept(u.department_id || "");
                          }}
                          className="text-xs text-ink underline underline-offset-2 hover:text-accent"
                        >
                          Roles
                        </button>
                      )}
                      {canDeactivate && u.id !== user?.id && (
                        <button
                          onClick={() => toggleStatus(u)}
                          className={`text-xs underline underline-offset-2 ${u.status === "active" ? "text-red-600 hover:text-red-700" : "text-emerald-600 hover:text-emerald-700"}`}
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
        </div>
      )}

      {activeTab === "roles" && (
        <div className="space-y-4">
          <p className="text-xs text-muted">
            Roles group fine-grained permission keys. AegisRAG evaluates permissions centrally on every API request.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {roles.map((r) => (
              <div key={r.id} className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-ink">{r.name}</h3>
                    <p className="text-xs text-muted">
                      Scope: {r.scope || "tenant"} • {r.is_system ? "System Role" : "Custom Bundle"}
                    </p>
                  </div>
                  {canManageRoles && !r.is_system && (
                    <Button
                      kind="secondary"
                      onClick={() => {
                        setShowEditRoleModal(r);
                        setSelectedPerms(r.permission_keys || []);
                      }}
                    >
                      Edit Keys
                    </Button>
                  )}
                </div>
                <div className="mt-3">
                  <p className="text-[0.7rem] uppercase tracking-wide text-muted">Permission Keys ({r.permission_keys?.length || 0}):</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(r.permission_keys || []).map((p) => (
                      <span key={p} className="rounded border border-line bg-white px-1.5 py-0.5 font-mono text-[0.65rem] text-ink">
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

      {activeTab === "departments" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">
              Departments organize teams and define boundary grants for hybrid retrieval access control.
            </p>
            {isOrgAdmin && (
              <Button onClick={() => { setNewDeptName(""); setShowCreateDeptModal(true); }}>
                + Add Department
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-line/20 text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Department Name</th>
                  <th className="px-4 py-3 font-medium">Active Members</th>
                  <th className="px-4 py-3 font-medium">Identifier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {departments.map((d) => (
                  <tr key={d.id} className="hover:bg-white/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink">{d.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                        {d.member_count ?? 0} member(s)
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted">{d.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "hr" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="display text-2xl">Employee Lifecycle Management</h3>
              <p className="text-xs text-muted">
                Handle employee onboarding, clearance levels, and secure offboarding with instant access termination.
              </p>
            </div>
            {isHrAdmin && (
              <Button onClick={() => { setOnboardName(""); setOnboardEmail(""); setOnboardClearance(1); setOnboardRole("employee"); setShowOnboardModal(true); }}>
                + Onboard New Employee
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-line/20 text-xs text-muted">
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
                  <tr key={u.id} className="hover:bg-white/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{u.name}</p>
                      <p className="text-xs text-muted font-mono">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{u.department_name || u.department_id || "General"}</td>
                    <td className="px-4 py-3 text-xs font-medium text-ink">{u.clearance_label}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${u.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isHrAdmin && u.id !== user?.id && u.status === "active" ? (
                        <Button kind="danger" onClick={() => handleHrOffboard(u)}>
                          Offboard
                        </Button>
                      ) : u.status !== "active" ? (
                        <span className="text-xs text-muted italic">Offboarded</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-xl">
            <h3 className="display text-2xl">Invite Tenant User</h3>
            <form onSubmit={handleInvite} className="mt-4 space-y-4">
              <label className="block text-sm font-medium">Email
                <input required type="email" className={`${inputClass} mt-1`} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              </label>
              <label className="block text-sm font-medium">Full Name
                <input required type="text" className={`${inputClass} mt-1`} value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
              </label>
              <label className="block text-sm font-medium">Clearance Level
                <select className={`${inputClass} mt-1`} value={inviteClearance} onChange={(e) => setInviteClearance(Number(e.target.value))}>
                  <option value={0}>0 - Public</option>
                  <option value={1}>1 - Internal</option>
                  <option value={2}>2 - Confidential</option>
                  <option value={3}>3 - Restricted</option>
                </select>
              </label>
              <label className="block text-sm font-medium">Department
                <select className={`${inputClass} mt-1`} value={inviteDept} onChange={(e) => setInviteDept(e.target.value)}>
                  <option value="">General / Unassigned</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
              <div>
                <label className="block text-sm font-medium">Roles</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {roles.map((r) => (
                    <label key={r.id} className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={inviteRoles.includes(r.name)}
                        onChange={(e) => {
                          if (e.target.checked) setInviteRoles([...inviteRoles, r.name]);
                          else setInviteRoles(inviteRoles.filter((x) => x !== r.name));
                        }}
                      />
                      {r.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button kind="secondary" type="button" onClick={() => setShowInviteModal(false)}>Cancel</Button>
                <Button type="submit">Invite</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Roles Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-xl">
            <h3 className="display text-2xl">Assign Roles & Clearance</h3>
            <p className="mt-1 text-xs text-muted">Configuring {showAssignModal.name} ({showAssignModal.email})</p>
            <form onSubmit={handleAssignRoles} className="mt-4 space-y-4">
              <label className="block text-sm font-medium">Clearance Level
                <select className={`${inputClass} mt-1`} value={assignClearance} onChange={(e) => setAssignClearance(Number(e.target.value))}>
                  <option value={0}>0 - Public</option>
                  <option value={1}>1 - Internal</option>
                  <option value={2}>2 - Confidential</option>
                  <option value={3}>3 - Restricted</option>
                </select>
              </label>
              <label className="block text-sm font-medium">Department
                <select className={`${inputClass} mt-1`} value={assignDept} onChange={(e) => setAssignDept(e.target.value)}>
                  <option value="">General / Unassigned</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
              <div>
                <label className="block text-sm font-medium">Assigned Roles</label>
                <div className="mt-2 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-line p-2 rounded">
                  {roles.map((r) => (
                    <label key={r.id} className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={assignRolesList.includes(r.name) || assignRolesList.includes(r.id)}
                        onChange={(e) => {
                          if (e.target.checked) setAssignRolesList([...assignRolesList, r.name]);
                          else setAssignRolesList(assignRolesList.filter((x) => x !== r.name && x !== r.id));
                        }}
                      />
                      {r.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button kind="secondary" type="button" onClick={() => setShowAssignModal(null)}>Cancel</Button>
                <Button type="submit">Save Changes</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Effective Access Modal */}
      {showEffectiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-line bg-white p-6 shadow-xl max-h-[85vh] overflow-y-auto">
            <h3 className="display text-2xl">Effective Access Preview</h3>
            <p className="mt-1 text-sm font-medium text-ink">{showEffectiveModal.user.name} ({showEffectiveModal.user.email})</p>
            <div className="mt-3 rounded bg-surface p-3 text-xs space-y-1">
              <p><strong>Readable Documents in Catalog:</strong> {showEffectiveModal.count}</p>
              <p><strong>Clearance:</strong> {showEffectiveModal.user.clearance_label} ({showEffectiveModal.user.clearance})</p>
              <p><strong>Roles:</strong> {showEffectiveModal.user.roles.join(", ")}</p>
            </div>
            <div className="mt-4">
              <h4 className="text-xs uppercase tracking-wide text-muted font-semibold">Active Permissions ({showEffectiveModal.perms.length}):</h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {showEffectiveModal.perms.map((p) => (
                  <span key={p} className="rounded border border-line bg-surface px-2 py-1 font-mono text-xs text-ink">
                    {p}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <Button kind="secondary" onClick={() => setShowEffectiveModal(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Role Builder Modal */}
      {(showCreateRoleModal || showEditRoleModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl border border-line bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="display text-2xl">{showEditRoleModal ? `Edit Role: ${showEditRoleModal.name}` : "Create Custom Role"}</h3>
            <p className="mt-1 text-xs text-muted">Bundle fine-grained permission keys into a custom delegated role.</p>
            <form onSubmit={showEditRoleModal ? handleUpdateRole : handleCreateRole} className="mt-4 space-y-4">
              {!showEditRoleModal && (
                <label className="block text-sm font-medium">Role Name
                  <input required placeholder="e.g. security_lead" className={`${inputClass} mt-1`} value={roleName} onChange={(e) => setRoleName(e.target.value)} />
                </label>
              )}
              <div>
                <label className="block text-sm font-medium">Permission Keys ({selectedPerms.length} selected)</label>
                <div className="mt-2 grid grid-cols-2 gap-2 border border-line p-3 rounded max-h-60 overflow-y-auto">
                  {permissions.map((p) => (
                    <label key={p} className="flex items-center gap-2 text-xs font-mono">
                      <input
                        type="checkbox"
                        checked={selectedPerms.includes(p)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedPerms([...selectedPerms, p]);
                          else setSelectedPerms(selectedPerms.filter((x) => x !== p));
                        }}
                      />
                      <span>{p}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button kind="secondary" type="button" onClick={() => { setShowCreateRoleModal(false); setShowEditRoleModal(null); }}>
                  Cancel
                </Button>
                <Button type="submit">{showEditRoleModal ? "Save Permissions" : "Create Role"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Department Modal */}
      {showCreateDeptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-xl">
            <h3 className="display text-2xl">Add Department</h3>
            <p className="mt-1 text-xs text-muted">Create a department boundary for grouping users and granting scoped access.</p>
            <form onSubmit={handleCreateDept} className="mt-4 space-y-4">
              <label className="block text-sm font-medium">Department Name
                <input
                  required
                  placeholder="e.g. Legal, Finance, Engineering"
                  className={`${inputClass} mt-1`}
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button kind="secondary" type="button" onClick={() => setShowCreateDeptModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Department</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HR Onboarding Modal */}
      {showOnboardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-line bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="display text-2xl">Onboard New Employee</h3>
            <p className="mt-1 text-xs text-muted">Register a new team member with department assignment and clearance level.</p>
            <form onSubmit={handleHrOnboard} className="mt-4 space-y-4">
              <label className="block text-sm font-medium">Full Name
                <input
                  required
                  placeholder="e.g. Jane Doe"
                  className={`${inputClass} mt-1`}
                  value={onboardName}
                  onChange={(e) => setOnboardName(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">Work Email
                <input
                  type="email"
                  required
                  placeholder="jane.doe@company.internal"
                  className={`${inputClass} mt-1`}
                  value={onboardEmail}
                  onChange={(e) => setOnboardEmail(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">Department
                  <select
                    className={`${inputClass} mt-1`}
                    value={onboardDept}
                    onChange={(e) => setOnboardDept(e.target.value)}
                  >
                    <option value="">General / Unassigned</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">Initial Clearance
                  <select
                    className={`${inputClass} mt-1`}
                    value={onboardClearance}
                    onChange={(e) => setOnboardClearance(Number(e.target.value))}
                  >
                    <option value={1}>1 - Internal</option>
                    <option value={2}>2 - Confidential</option>
                    <option value={3}>3 - Restricted</option>
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium">Primary Role
                <select
                  className={`${inputClass} mt-1`}
                  value={onboardRole}
                  onChange={(e) => setOnboardRole(e.target.value)}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button kind="secondary" type="button" onClick={() => setShowOnboardModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">Complete Onboarding</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
