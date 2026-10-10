import { useEffect, useState } from "react";
import {
  Building2,
  Shield,
  FileCode2,
  Users,
  FileText,
  Sparkles,
  Plus,
  Headphones,
  Search,
  RefreshCw,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { Cpu as CpuIcon } from "lucide-react";
import { SectionCard } from "../components/ui/SectionCard";
import { StatCard } from "../components/ui/StatCard";
import { StatusPill } from "../components/ui/StatusPill";
import { DataTable, type Column } from "../components/ui/DataTable";
import { Drawer } from "../components/ui/Drawer";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/Toast";
import { inputClass } from "../components/ui/field";
import { api, patch, post } from "../lib/api";
import type { PlatformMetrics, PlatformSecuritySettings, TenantInfo } from "../lib/types";

type PlatformAuditItem = {
  id: number;
  tenant_id: string;
  time: string;
  actor: string;
  action: string;
  decision: string;
  correlation_id?: string;
  detail?: Record<string, unknown>;
};

export default function PlatformAdmin() {
  const { showToast } = useToast();
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [securitySettings, setSecuritySettings] = useState<PlatformSecuritySettings | null>(null);
  const [platformAuditLogs, setPlatformAuditLogs] = useState<PlatformAuditItem[]>([]);
  const [activeTab, setActiveTab] = useState<"tenants" | "security" | "audit">("tenants");
  const [tenantSearch, setTenantSearch] = useState("");

  // Create tenant drawer
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [isCreatingTenant, setIsCreatingTenant] = useState(false);

  // Support session drawer
  const [showSupportDrawer, setShowSupportDrawer] = useState(false);
  const [supportTenantId, setSupportTenantId] = useState("");
  const [supportReason, setSupportReason] = useState("");
  const [supportDuration, setSupportDuration] = useState(60);
  const [isAuthorizingSupport, setIsAuthorizingSupport] = useState(false);

  // Suspend/reactivate tenant dialog
  const [tenantToToggle, setTenantToToggle] = useState<TenantInfo | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  // Audit event details drawer
  const [selectedAuditLog, setSelectedAuditLog] = useState<PlatformAuditItem | null>(null);

  // Security settings form state
  const [mfaEnforced, setMfaEnforced] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState(60);
  const [maxFailedLogins, setMaxFailedLogins] = useState(5);
  const [passwordMinLength, setPasswordMinLength] = useState(12);
  const [allowedFileTypes, setAllowedFileTypes] = useState(".pdf, .docx, .xlsx, .txt, .csv");
  const [maxUploadSize, setMaxUploadSize] = useState(25);
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);

  const loadData = () => {
    api<PlatformMetrics>("/platform/metrics")
      .then(setMetrics)
      .catch((e) => showToast(e.message, "error"));

    api<TenantInfo[]>("/platform/tenants")
      .then(setTenants)
      .catch((e) => showToast(e.message, "error"));

    api<PlatformSecuritySettings>("/platform/security-settings")
      .then((sec) => {
        setSecuritySettings(sec);
        setMfaEnforced(sec.mfa_enforced);
        setSessionTimeout(sec.session_timeout_minutes);
        setMaxFailedLogins(sec.max_failed_logins ?? 5);
        setPasswordMinLength(sec.password_min_length);
        setAllowedFileTypes(sec.allowed_file_types?.join(", ") || ".pdf, .txt");
        setMaxUploadSize(sec.max_upload_size_mb);
      })
      .catch(() => {});
  };

  const loadAudit = () => {
    api<PlatformAuditItem[]>("/platform/audit")
      .then(setPlatformAuditLogs)
      .catch((e) => showToast(e.message, "error"));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === "audit") {
      loadAudit();
    }
  }, [activeTab]);

  async function handleCreateTenant(e: React.FormEvent) {
    e.preventDefault();
    if (!newTenantName.trim()) return;
    setIsCreatingTenant(true);
    try {
      await post("/platform/tenants", { name: newTenantName.trim() });
      showToast(`Tenant '${newTenantName}' created successfully.`, "success");
      setShowCreateDrawer(false);
      setNewTenantName("");
      loadData();
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setIsCreatingTenant(false);
    }
  }

  async function confirmToggleTenantStatus() {
    if (!tenantToToggle) return;
    setIsTogglingStatus(true);
    const newStatus = tenantToToggle.status === "active" ? "suspended" : "active";
    try {
      await patch(`/platform/tenants/${tenantToToggle.id}/status`, { status: newStatus });
      showToast(
        `Tenant '${tenantToToggle.name}' is now ${newStatus}.`,
        newStatus === "active" ? "success" : "info"
      );
      setTenantToToggle(null);
      loadData();
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setIsTogglingStatus(false);
    }
  }

  async function handleSupportAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!supportReason.trim() || !supportTenantId) return;
    setIsAuthorizingSupport(true);
    try {
      const res = await post<{ expires_at: string; tenant_name: string }>("/platform/support-access", {
        tenant_id: supportTenantId,
        reason: supportReason.trim(),
        duration_minutes: Number(supportDuration),
      });
      showToast(
        `Support session created for ${res.tenant_name} until ${new Date(res.expires_at).toLocaleTimeString()}.`,
        "success"
      );
      setShowSupportDrawer(false);
      setSupportReason("");
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setIsAuthorizingSupport(false);
    }
  }

  async function handleSaveSecuritySettings(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingSecurity(true);
    try {
      const fileTypesArray = allowedFileTypes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.startsWith(".") ? s : `.${s}`));

      const updated = await patch<PlatformSecuritySettings>("/platform/security-settings", {
        mfa_enforced: mfaEnforced,
        session_timeout_minutes: Number(sessionTimeout),
        max_failed_logins: Number(maxFailedLogins),
        password_min_length: Number(passwordMinLength),
        allowed_file_types: fileTypesArray,
        max_upload_size_mb: Number(maxUploadSize),
      });
      setSecuritySettings(updated);
      showToast("Global security settings enforced platform-wide.", "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setIsSavingSecurity(false);
    }
  }

  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.id.toLowerCase().includes(tenantSearch.toLowerCase())
  );

  const tenantColumns: Column<TenantInfo>[] = [
    {
      key: "name",
      header: "Tenant Organization",
      render: (t) => (
        <div>
          <p className="font-semibold text-ink">{t.name}</p>
          <p className="font-mono text-xs text-muted">{t.id}</p>
        </div>
      ),
    },
    {
      key: "users",
      header: "Active Users",
      render: (t) => <span className="font-medium text-ink">{t.users_count ?? "-"}</span>,
    },
    {
      key: "docs",
      header: "Indexed Docs",
      render: (t) => <span className="font-medium text-ink">{t.documents_count ?? "-"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (t) => <StatusPill status={t.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (t) => (
        <Button
          kind={t.status === "active" ? "danger" : "secondary"}
          onClick={(e) => {
            e.stopPropagation();
            setTenantToToggle(t);
          }}
        >
          {t.status === "active" ? "Suspend" : "Reactivate"}
        </Button>
      ),
    },
  ];

  const auditColumns: Column<PlatformAuditItem>[] = [
    {
      key: "time",
      header: "Timestamp",
      render: (log) => (
        <span className="font-mono text-xs text-muted">
          {new Date(log.time).toLocaleString()}
        </span>
      ),
    },
    {
      key: "tenant",
      header: "Tenant",
      render: (log) => (
        <span className="font-mono text-xs font-semibold text-ink">{log.tenant_id}</span>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      render: (log) => <span className="text-xs font-medium text-ink">{log.actor}</span>,
    },
    {
      key: "action",
      header: "Action",
      render: (log) => (
        <span className="rounded bg-surface-subtle px-2 py-0.5 font-mono text-[0.7rem] text-ink">
          {log.action}
        </span>
      ),
    },
    {
      key: "decision",
      header: "Decision",
      render: (log) => <StatusPill status={log.decision} />,
    },
    {
      key: "detail",
      header: "Details",
      render: (log) => (
        <span className="font-mono text-xs text-muted truncate max-w-xs block">
          {log.detail ? JSON.stringify(log.detail) : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          icon={CpuIcon}
        title="Platform Administration"
          subtitle="Tenants, health and oversight."
        />
        {activeTab === "tenants" && (
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowCreateDrawer(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              New Tenant
            </Button>
            <Button
              kind="secondary"
              onClick={() => {
                setSupportTenantId(tenants[0]?.id || "");
                setShowSupportDrawer(true);
              }}
            >
              <Headphones className="h-3.5 w-3.5 mr-1" />
              Support Session
            </Button>
          </div>
        )}
      </div>

      <Notice tone="info">
        <strong>Super Admin Zero-Trust Boundary:</strong> Platform Super Admins manage infrastructure and policies but cannot inspect tenant document text without explicit authorization grants and clearance.
      </Notice>

      {/* KPI Metrics Strip */}
      {metrics && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Organizations"
            value={metrics.total_tenants}
            subtext="Active tenant accounts"
          />
          <StatCard
            label="Platform Users"
            value={metrics.total_users}
            subtext="Registered accounts"
          />
          <StatCard
            label="Indexed Documents"
            value={metrics.total_documents}
            subtext="Ingested catalog files"
          />
          <StatCard
            label="Executed Queries"
            value={metrics.total_queries}
            subtext="Total RAG inferences"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-line gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab("tenants")}
          className={`flex items-center gap-2 pb-3 transition-colors border-b-2 ${
            activeTab === "tenants"
              ? "border-ink text-ink font-semibold"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          <Building2 className="h-4 w-4" />
          Tenants Directory ({tenants.length})
        </button>
        <button
          onClick={() => setActiveTab("security")}
          className={`flex items-center gap-2 pb-3 transition-colors border-b-2 ${
            activeTab === "security"
              ? "border-ink text-ink font-semibold"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          <Shield className="h-4 w-4" />
          Global Security Settings
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 pb-3 transition-colors border-b-2 ${
            activeTab === "audit"
              ? "border-ink text-ink font-semibold"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          <FileCode2 className="h-4 w-4" />
          Platform Audit Oversight
        </button>
      </div>

      {/* Tab: Tenants Directory */}
      {activeTab === "tenants" && (
        <SectionCard
          title={`Tenants Directory (${tenants.length})`}
          subtitle="All organizations hosted on this Eyes Only cluster."
        >
          <div className="space-y-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Filter by organization name or ID..."
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface-subtle py-2 pl-9 pr-3 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
              />
            </div>

            <DataTable
              columns={tenantColumns}
              data={filteredTenants}
              keyExtractor={(t) => t.id}
              emptyMessage="No tenants matched your search."
            />
          </div>
        </SectionCard>
      )}

      {/* Tab: Global Security Settings */}
      {activeTab === "security" && (
        <div className="space-y-6">
          <SectionCard
            title="Global Security Policies"
            subtitle="Configure cluster-wide authentication thresholds, file restrictions, and session security constraints."
          >
            <form onSubmit={handleSaveSecuritySettings} className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="rounded-xl border border-line bg-surface-subtle p-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-line text-accent"
                        checked={mfaEnforced}
                        onChange={(e) => setMfaEnforced(e.target.checked)}
                      />
                      <div>
                        <span className="text-sm font-semibold text-ink">
                          Enforce Multi-Factor Authentication (MFA)
                        </span>
                        <p className="mt-0.5 text-xs text-muted">
                          Require all tenant administrators and privileged roles to provide MFA tokens.
                        </p>
                      </div>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink">
                      Session Timeout (Minutes)
                      <input
                        type="number"
                        min={5}
                        max={1440}
                        className={`${inputClass} mt-1.5`}
                        value={sessionTimeout}
                        onChange={(e) => setSessionTimeout(Number(e.target.value))}
                      />
                    </label>
                    <p className="mt-1 text-xs text-muted">
                      Inactivity window before revoking active session tokens.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink">
                      Max Failed Login Attempts
                      <input
                        type="number"
                        min={3}
                        max={10}
                        className={`${inputClass} mt-1.5`}
                        value={maxFailedLogins}
                        onChange={(e) => setMaxFailedLogins(Number(e.target.value))}
                      />
                    </label>
                    <p className="mt-1 text-xs text-muted">
                      Consecutive failures before temporarily locking account credentials.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-ink">
                      Minimum Password Length
                      <input
                        type="number"
                        min={8}
                        max={64}
                        className={`${inputClass} mt-1.5`}
                        value={passwordMinLength}
                        onChange={(e) => setPasswordMinLength(Number(e.target.value))}
                      />
                    </label>
                    <p className="mt-1 text-xs text-muted">
                      Enforced across all tenant user account credentials.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink">
                      Allowed File Upload Extensions
                      <input
                        type="text"
                        className={`${inputClass} mt-1.5 font-mono text-xs`}
                        value={allowedFileTypes}
                        onChange={(e) => setAllowedFileTypes(e.target.value)}
                      />
                    </label>
                    <p className="mt-1 text-xs text-muted">
                      Comma-separated list of permitted extensions (e.g. .pdf, .docx, .xlsx, .txt, .csv)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink">
                      Maximum Document Upload Size (MB)
                      <input
                        type="number"
                        min={1}
                        max={100}
                        className={`${inputClass} mt-1.5`}
                        value={maxUploadSize}
                        onChange={(e) => setMaxUploadSize(Number(e.target.value))}
                      />
                    </label>
                    <p className="mt-1 text-xs text-muted">
                      Max size per document ingested into tenant RAG vector store.
                    </p>
                  </div>
                </div>
              </div>

              {/* Cryptographic Standards */}
              <div className="grid gap-4 sm:grid-cols-3 pt-2">
                <div className="rounded-xl border border-line bg-surface-subtle p-4">
                  <p className="text-[0.7rem] uppercase tracking-wider font-mono text-muted">At-Rest Encryption</p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {securitySettings?.encryption_standard || "AES-256-GCM"}
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-surface-subtle p-4">
                  <p className="text-[0.7rem] uppercase tracking-wider font-mono text-muted">In-Transit Protocol</p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {securitySettings?.tls_version_minimum || "TLS 1.3"}
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-surface-subtle p-4">
                  <p className="text-[0.7rem] uppercase tracking-wider font-mono text-muted">Audit Trail Integrity</p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {securitySettings?.audit_immutable ? "Append-Only (Immutable)" : "Enabled"}
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={isSavingSecurity}>
                  {isSavingSecurity ? "Saving Settings..." : "Save Global Security Settings"}
                </Button>
              </div>
            </form>
          </SectionCard>
        </div>
      )}

      {/* Tab: Platform Audit Oversight */}
      {activeTab === "audit" && (
        <SectionCard
          title="Platform-Wide Audit Trail"
          subtitle="Global oversight into security, access decisions, and tenant-lifecycle administrative actions. Click any row for details."
          action={
            <Button kind="secondary" onClick={loadAudit}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
          }
        >
          <DataTable
            columns={auditColumns}
            data={platformAuditLogs}
            keyExtractor={(log) => log.id}
            onRowClick={(log) => setSelectedAuditLog(log)}
            emptyMessage="No platform audit logs recorded."
          />
        </SectionCard>
      )}

      {/* Provision New Tenant Drawer */}
      <Drawer
        isOpen={showCreateDrawer}
        onClose={() => setShowCreateDrawer(false)}
        title="Provision New Tenant"
        subtitle="Create a new isolated organization space with separate role hierarchies and vector stores."
      >
        <form onSubmit={handleCreateTenant} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-ink">
              Organization Name
              <input
                required
                placeholder="e.g. Wayne Enterprises"
                className={`${inputClass} mt-1.5`}
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
              />
            </label>
            <p className="mt-1 text-xs text-muted">
              A tenant ID slug will be automatically created from this name.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-line">
            <Button
              kind="secondary"
              type="button"
              onClick={() => setShowCreateDrawer(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreatingTenant || !newTenantName.trim()}>
              {isCreatingTenant ? "Creating..." : "Create Tenant"}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Support Access Drawer */}
      <Drawer
        isOpen={showSupportDrawer}
        onClose={() => setShowSupportDrawer(false)}
        title="Privileged Support Session"
        subtitle="Audited, time-bound, reason-coded support authorization for platform engineers."
      >
        <form onSubmit={handleSupportAccess} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-ink">
              Select Tenant Organization
              <select
                className={`${inputClass} mt-1.5`}
                value={supportTenantId}
                onChange={(e) => setSupportTenantId(e.target.value)}
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.id})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink">
              Session Duration (Minutes)
              <input
                type="number"
                min={10}
                max={240}
                className={`${inputClass} mt-1.5`}
                value={supportDuration}
                onChange={(e) => setSupportDuration(Number(e.target.value))}
              />
            </label>
            <p className="mt-1 text-xs text-muted">
              Maximum session duration is 240 minutes (4 hours).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink">
              Reason Code & Justification
              <textarea
                required
                rows={3}
                placeholder="e.g. INC-4091: Assisting tenant admin with ingestion pipeline debugging..."
                className={`${inputClass} mt-1.5`}
                value={supportReason}
                onChange={(e) => setSupportReason(e.target.value)}
              />
            </label>
            <p className="mt-1 text-xs text-muted">
              This reason will be immutably recorded in the platform audit log.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-line">
            <Button
              kind="secondary"
              type="button"
              onClick={() => setShowSupportDrawer(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isAuthorizingSupport || !supportReason.trim()}
            >
              {isAuthorizingSupport ? "Authorizing..." : "Authorize Session"}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Confirm Suspend/Reactivate Dialog */}
      <ConfirmDialog
        isOpen={Boolean(tenantToToggle)}
        title={tenantToToggle?.status === "active" ? "Suspend Organization" : "Reactivate Organization"}
        description={
          tenantToToggle?.status === "active"
            ? `Are you sure you want to suspend ${tenantToToggle?.name}? All users in this tenant will immediately lose access to RAG queries and documents.`
            : `Reactivate ${tenantToToggle?.name}? Members will regain access according to their existing permissions.`
        }
        confirmText={
          isTogglingStatus
            ? "Updating..."
            : tenantToToggle?.status === "active"
            ? "Suspend Tenant"
            : "Reactivate Tenant"
        }
        tone={tenantToToggle?.status === "active" ? "danger" : "primary"}
        busy={isTogglingStatus}
        onConfirm={confirmToggleTenantStatus}
        onClose={() => setTenantToToggle(null)}
      />

      {/* Audit Event Details Drawer */}
      <Drawer
        isOpen={Boolean(selectedAuditLog)}
        onClose={() => setSelectedAuditLog(null)}
        title="Platform Audit Event"
        subtitle={`Event ID #${selectedAuditLog?.id} • Tenant ${selectedAuditLog?.tenant_id}`}
      >
        {selectedAuditLog && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <p className="text-xs uppercase tracking-wider font-mono text-muted">Decision</p>
                <div className="mt-1">
                  <StatusPill status={selectedAuditLog.decision} size="md" />
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider font-mono text-muted">Timestamp</p>
                <p className="mt-1 font-mono text-xs text-ink">
                  {new Date(selectedAuditLog.time).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="font-mono text-muted uppercase">Actor</span>
                <p className="mt-0.5 font-semibold text-ink">{selectedAuditLog.actor}</p>
              </div>
              <div>
                <span className="font-mono text-muted uppercase">Action</span>
                <p className="mt-0.5 font-mono text-ink">{selectedAuditLog.action}</p>
              </div>
            </div>

            {selectedAuditLog.detail && (
              <div>
                <span className="text-xs font-mono text-muted uppercase">Event Payload</span>
                <pre className="mt-1.5 overflow-x-auto rounded-lg border border-line bg-surface-subtle p-3 font-mono text-xs text-ink">
                  {JSON.stringify(selectedAuditLog.detail, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
