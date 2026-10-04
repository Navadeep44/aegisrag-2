import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
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
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [securitySettings, setSecuritySettings] = useState<PlatformSecuritySettings | null>(null);
  const [platformAuditLogs, setPlatformAuditLogs] = useState<PlatformAuditItem[]>([]);
  const [activeTab, setActiveTab] = useState<"tenants" | "security" | "audit">("tenants");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Create tenant modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");

  // Support session modal
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportTenantId, setSupportTenantId] = useState("");
  const [supportReason, setSupportReason] = useState("");
  const [supportDuration, setSupportDuration] = useState(60);

  // Security settings form state
  const [mfaEnforced, setMfaEnforced] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState(60);
  const [maxFailedLogins, setMaxFailedLogins] = useState(5);
  const [passwordMinLength, setPasswordMinLength] = useState(12);
  const [allowedFileTypes, setAllowedFileTypes] = useState(".pdf, .docx, .xlsx, .txt, .csv");
  const [maxUploadSize, setMaxUploadSize] = useState(25);
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);

  const loadData = () => {
    api<PlatformMetrics>("/platform/metrics").then(setMetrics).catch((e) => setError(e.message));
    api<TenantInfo[]>("/platform/tenants").then(setTenants).catch((e) => setError(e.message));
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
    api<PlatformAuditItem[]>("/platform/audit").then(setPlatformAuditLogs).catch((e) => setError(e.message));
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
    setError("");
    setNotice("");
    try {
      await post("/platform/tenants", { name: newTenantName.trim() });
      setNotice(`Tenant '${newTenantName}' created successfully.`);
      setShowCreateModal(false);
      setNewTenantName("");
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleTenantStatus(t: TenantInfo) {
    setError("");
    setNotice("");
    const newStatus = t.status === "active" ? "suspended" : "active";
    try {
      await patch(`/platform/tenants/${t.id}/status`, { status: newStatus });
      setNotice(`Tenant '${t.name}' is now ${newStatus}. Suspended tenants cannot query the RAG system.`);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSupportAccess(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const res = await post<{ expires_at: string; tenant_name: string }>("/platform/support-access", {
        tenant_id: supportTenantId,
        reason: supportReason.trim(),
        duration_minutes: Number(supportDuration),
      });
      setNotice(`Privileged support session created for ${res.tenant_name} until ${new Date(res.expires_at).toLocaleTimeString()}.`);
      setShowSupportModal(false);
      setSupportReason("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSaveSecuritySettings(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
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
      setNotice("Global security settings successfully updated and enforced platform-wide.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSavingSecurity(false);
    }
  }

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader title="Platform Administration">
          Global tenant lifecycle, infrastructure health, operational metrics, and privileged oversight.
        </PageHeader>
        {activeTab === "tenants" && (
          <div className="flex gap-2">
            <Button onClick={() => setShowCreateModal(true)}>+ New Tenant</Button>
            <Button kind="secondary" onClick={() => { setSupportTenantId(tenants[0]?.id || ""); setShowSupportModal(true); }}>
              Support Session
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 leading-relaxed">
        <strong>Security Constraint:</strong> Platform Super Admin cannot read tenant document content solely by platform role. Tenant document access requires explicit document grants and clearance.
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="info">{notice}</Notice>}

      {metrics && (
        <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <p className="text-xs uppercase tracking-wide text-muted">Total Organizations</p>
            <p className="display mt-1 text-3xl font-semibold text-ink">{metrics.total_tenants}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <p className="text-xs uppercase tracking-wide text-muted">Platform Users</p>
            <p className="display mt-1 text-3xl font-semibold text-ink">{metrics.total_users}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <p className="text-xs uppercase tracking-wide text-muted">Indexed Documents</p>
            <p className="display mt-1 text-3xl font-semibold text-ink">{metrics.total_documents}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <p className="text-xs uppercase tracking-wide text-muted">Executed Queries</p>
            <p className="display mt-1 text-3xl font-semibold text-ink">{metrics.total_queries}</p>
          </div>
        </section>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-line">
        <button
          onClick={() => setActiveTab("tenants")}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "tenants" ? "border-ink text-ink font-semibold" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          Tenants Directory ({tenants.length})
        </button>
        <button
          onClick={() => setActiveTab("security")}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "security" ? "border-ink text-ink font-semibold" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          Global Security Settings
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "audit" ? "border-ink text-ink font-semibold" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          Platform Audit Oversight
        </button>
      </div>

      {activeTab === "tenants" && (
        <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
          <h2 className="display text-2xl">Tenants Directory ({tenants.length})</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-line/20 text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Tenant Name</th>
                  <th className="px-4 py-3 font-medium">Tenant ID</th>
                  <th className="px-4 py-3 font-medium">Users</th>
                  <th className="px-4 py-3 font-medium">Documents</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-white/50">
                    <td className="px-4 py-3 font-semibold text-ink">{t.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{t.id}</td>
                    <td className="px-4 py-3 text-ink">{t.users_count ?? "-"}</td>
                    <td className="px-4 py-3 text-ink">{t.documents_count ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          t.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleTenantStatus(t)}
                        className={`text-xs underline underline-offset-2 ${
                          t.status === "active" ? "text-rose-600 hover:text-rose-700" : "text-emerald-600 hover:text-emerald-700"
                        }`}
                      >
                        {t.status === "active" ? "Suspend Tenant" : "Reactivate Tenant"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "security" && (
        <section className="space-y-6">
          <div className="rounded-xl border border-line bg-surface p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="display text-2xl">Global Security Policies</h2>
                <p className="mt-1 text-xs text-muted">
                  Configure SaaS-wide authentication thresholds, file restrictions, and session security constraints.
                </p>
              </div>
              {securitySettings?.updated_at && (
                <span className="text-xs text-muted font-mono">
                  Last updated: {new Date(securitySettings.updated_at).toLocaleString()}
                </span>
              )}
            </div>

            <form onSubmit={handleSaveSecuritySettings} className="mt-6 space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="rounded-lg border border-line bg-white p-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-line text-accent"
                        checked={mfaEnforced}
                        onChange={(e) => setMfaEnforced(e.target.checked)}
                      />
                      <div>
                        <span className="text-sm font-semibold text-ink">Enforce Multi-Factor Authentication (MFA)</span>
                        <p className="text-xs text-muted">
                          Require all tenant administrators and elevated users to supply hardware or TOTP factors.
                        </p>
                      </div>
                    </label>
                  </div>

                  <label className="block text-sm font-medium">
                    Session Timeout (Minutes)
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      className={`${inputClass} mt-1`}
                      value={sessionTimeout}
                      onChange={(e) => setSessionTimeout(Number(e.target.value))}
                    />
                    <span className="text-xs text-muted">Inactivity window before revoking active session tokens.</span>
                  </label>

                  <label className="block text-sm font-medium">
                    Max Failed Login Attempts
                    <input
                      type="number"
                      min={3}
                      max={10}
                      className={`${inputClass} mt-1`}
                      value={maxFailedLogins}
                      onChange={(e) => setMaxFailedLogins(Number(e.target.value))}
                    />
                    <span className="text-xs text-muted">Consecutive failures before temporarily locking account.</span>
                  </label>
                </div>

                <div className="space-y-4">
                  <label className="block text-sm font-medium">
                    Minimum Password Length
                    <input
                      type="number"
                      min={8}
                      max={64}
                      className={`${inputClass} mt-1`}
                      value={passwordMinLength}
                      onChange={(e) => setPasswordMinLength(Number(e.target.value))}
                    />
                    <span className="text-xs text-muted">Enforced across all tenant user account credentials.</span>
                  </label>

                  <label className="block text-sm font-medium">
                    Allowed File Upload Extensions
                    <input
                      type="text"
                      className={`${inputClass} mt-1 font-mono`}
                      value={allowedFileTypes}
                      onChange={(e) => setAllowedFileTypes(e.target.value)}
                    />
                    <span className="text-xs text-muted">Comma-separated list (e.g. .pdf, .docx, .xlsx, .txt, .csv)</span>
                  </label>

                  <label className="block text-sm font-medium">
                    Maximum Document Upload Size (MB)
                    <input
                      type="number"
                      min={1}
                      max={100}
                      className={`${inputClass} mt-1`}
                      value={maxUploadSize}
                      onChange={(e) => setMaxUploadSize(Number(e.target.value))}
                    />
                    <span className="text-xs text-muted">Max size per document ingested into tenant RAG vector store.</span>
                  </label>
                </div>
              </div>

              {/* Cryptographic Standards Cards */}
              <div className="grid gap-4 sm:grid-cols-3 pt-2">
                <div className="rounded-lg border border-line bg-slate-50 p-3">
                  <p className="text-[0.7rem] uppercase tracking-wide text-muted font-semibold">At-Rest Encryption</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{securitySettings?.encryption_standard || "AES-256-GCM"}</p>
                </div>
                <div className="rounded-lg border border-line bg-slate-50 p-3">
                  <p className="text-[0.7rem] uppercase tracking-wide text-muted font-semibold">In-Transit Protocol</p>
                  <p className="mt-1 text-sm font-semibold text-ink">{securitySettings?.tls_version_minimum || "TLS 1.3"}</p>
                </div>
                <div className="rounded-lg border border-line bg-slate-50 p-3">
                  <p className="text-[0.7rem] uppercase tracking-wide text-muted font-semibold">Audit Trail Integrity</p>
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
          </div>
        </section>
      )}

      {activeTab === "audit" && (
        <section className="rounded-xl border border-line bg-surface p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="display text-2xl">Platform-Wide Audit Trail</h2>
              <p className="mt-1 text-xs text-muted">
                Global oversight into security, access decisions, and tenant-lifecycle administrative actions.
              </p>
            </div>
            <Button kind="secondary" onClick={loadAudit}>
              Refresh Logs
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-line/20 text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Decision</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {platformAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/50 text-xs">
                    <td className="px-4 py-2.5 font-mono text-muted">{new Date(log.time).toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-mono text-ink font-semibold">{log.tenant_id}</td>
                    <td className="px-4 py-2.5 font-medium text-ink">{log.actor}</td>
                    <td className="px-4 py-2.5 font-mono">{log.action}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${
                          log.decision === "allowed" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {log.decision}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-muted truncate max-w-xs">
                      {log.detail ? JSON.stringify(log.detail) : "-"}
                    </td>
                  </tr>
                ))}
                {platformAuditLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted">
                      No platform audit logs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Create Tenant Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-xl">
            <h3 className="display text-2xl">Provision New Tenant</h3>
            <form onSubmit={handleCreateTenant} className="mt-4 space-y-4">
              <label className="block text-sm font-medium">
                Organization Name
                <input
                  required
                  placeholder="e.g. Wayne Enterprises"
                  className={`${inputClass} mt-1`}
                  value={newTenantName}
                  onChange={(e) => setNewTenantName(e.target.value)}
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button kind="secondary" type="button" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Tenant</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Support Access Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-xl">
            <h3 className="display text-2xl">Privileged Support Session</h3>
            <p className="mt-1 text-xs text-muted">Audited, time-bound, reason-coded support authorization.</p>
            <form onSubmit={handleSupportAccess} className="mt-4 space-y-4">
              <label className="block text-sm font-medium">
                Select Tenant
                <select className={`${inputClass} mt-1`} value={supportTenantId} onChange={(e) => setSupportTenantId(e.target.value)}>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.id})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium">
                Session Duration (Minutes)
                <input
                  type="number"
                  min={10}
                  max={240}
                  className={`${inputClass} mt-1`}
                  value={supportDuration}
                  onChange={(e) => setSupportDuration(Number(e.target.value))}
                />
              </label>

              <label className="block text-sm font-medium">
                Reason Code & Justification
                <textarea
                  required
                  rows={3}
                  placeholder="Ticket reference and reason for session..."
                  className={`${inputClass} mt-1`}
                  value={supportReason}
                  onChange={(e) => setSupportReason(e.target.value)}
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <Button kind="secondary" type="button" onClick={() => setShowSupportModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">Authorize Session</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
