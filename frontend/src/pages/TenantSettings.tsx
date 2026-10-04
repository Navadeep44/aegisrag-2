import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { inputClass } from "../components/ui/field";
import { useAuth } from "../context/AuthContext";
import { api, patch, post } from "../lib/api";
import type { TenantBilling, TenantInfo, TenantUsage, User } from "../lib/types";

export default function TenantSettings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"settings" | "billing" | "admins">("settings");
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [billing, setBilling] = useState<TenantBilling | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [maxUpload, setMaxUpload] = useState(25);
  const [retentionDays, setRetentionDays] = useState(90);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const isOwner = user?.roles?.includes("organization_owner") || user?.is_platform_admin || user?.is_admin;

  const loadData = () => {
    api<TenantInfo>("/tenant/settings")
      .then((t) => {
        setTenant(t);
        setName(t.name);
        setMaxUpload(Number(t.settings?.max_upload_mb ?? 25));
        setRetentionDays(Number(t.settings?.retention_days ?? 90));
      })
      .catch((e) => setError(e.message));

    api<TenantUsage>("/tenant/usage")
      .then(setUsage)
      .catch(() => {});

    api<TenantBilling>("/tenant/billing")
      .then(setBilling)
      .catch(() => {});

    api<User[]>("/users")
      .then(setUsers)
      .catch(() => {});
  };

  useEffect(() => {
    loadData();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      const updated = await patch<TenantInfo>("/tenant/settings", {
        name: name.trim(),
        settings: {
          max_upload_mb: Number(maxUpload),
          retention_days: Number(retentionDays),
        },
      });
      setTenant(updated);
      setNotice("Tenant settings updated successfully.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleAdminRole(targetUser: User) {
    const isCurrentlyAdmin = targetUser.roles.includes("admin");
    const action = isCurrentlyAdmin ? "revoke" : "assign";
    if (isCurrentlyAdmin && !window.confirm(`Revoke administrator privileges from ${targetUser.name}?`)) return;
    setError(""); setNotice("");
    try {
      await post("/tenant/admins", { user_id: targetUser.id, action });
      setNotice(`${isCurrentlyAdmin ? "Revoked" : "Assigned"} admin role for ${targetUser.name}.`);
      loadData();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <PageHeader title="Organization Management">
        Organization account controls, retention quotas, billing metrics, and administrator designations.
      </PageHeader>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="info">{notice}</Notice>}

      <div className="flex border-b border-line gap-4 text-sm font-medium">
        <button
          onClick={() => setActiveTab("settings")}
          className={`pb-2.5 transition-colors border-b-2 ${activeTab === "settings" ? "border-ink text-ink font-semibold" : "border-transparent text-muted hover:text-ink"}`}
        >
          General & Limits
        </button>
        <button
          onClick={() => setActiveTab("billing")}
          className={`pb-2.5 transition-colors border-b-2 ${activeTab === "billing" ? "border-ink text-ink font-semibold" : "border-transparent text-muted hover:text-ink"}`}
        >
          Usage & Billing
        </button>
        {isOwner && (
          <button
            onClick={() => setActiveTab("admins")}
            className={`pb-2.5 transition-colors border-b-2 ${activeTab === "admins" ? "border-ink text-ink font-semibold" : "border-transparent text-muted hover:text-ink"}`}
          >
            Organization Administrators
          </button>
        )}
      </div>

      {activeTab === "settings" && (
        <div className="space-y-8">
          {usage && (
            <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
                <p className="text-xs uppercase tracking-wide text-muted">Active Users</p>
                <p className="display mt-1 text-3xl font-semibold text-ink">{usage.users_count}</p>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
                <p className="text-xs uppercase tracking-wide text-muted">Catalog Documents</p>
                <p className="display mt-1 text-3xl font-semibold text-ink">{usage.documents_count}</p>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
                <p className="text-xs uppercase tracking-wide text-muted">Total Queries</p>
                <p className="display mt-1 text-3xl font-semibold text-ink">{usage.queries_count}</p>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
                <p className="text-xs uppercase tracking-wide text-muted">Rendered Pages</p>
                <p className="display mt-1 text-3xl font-semibold text-ink">{usage.total_rendered_pages}</p>
              </div>
            </section>
          )}

          <form onSubmit={handleSave} className="space-y-6 rounded-xl border border-line bg-surface p-6 shadow-sm">
            <h2 className="display text-2xl">Organization Profile & Limits</h2>

            <div className="space-y-4 max-w-lg">
              <label className="block text-sm font-medium">Organization Display Name
                <input
                  required
                  className={`${inputClass} mt-1`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              <label className="block text-sm font-medium">Maximum Upload File Size (MB)
                <input
                  type="number"
                  min={1}
                  max={100}
                  className={`${inputClass} mt-1`}
                  value={maxUpload}
                  onChange={(e) => setMaxUpload(Number(e.target.value))}
                />
              </label>

              <label className="block text-sm font-medium">Data & Audit Retention Period (Days)
                <input
                  type="number"
                  min={7}
                  max={365}
                  className={`${inputClass} mt-1`}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                />
              </label>
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={saving}>Save Settings</Button>
            </div>
          </form>
        </div>
      )}

      {activeTab === "billing" && billing && (
        <div className="space-y-6">
          <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
              <div>
                <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  {billing.status}
                </span>
                <h2 className="display mt-1 text-3xl font-semibold text-ink">{billing.plan}</h2>
                <p className="text-xs text-muted">Billed {billing.billing_cycle.toLowerCase()} • Next invoice on {billing.next_invoice_date}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">Estimated Current Month</p>
                <p className="display text-3xl font-bold text-ink">${billing.estimated_monthly_total.toFixed(2)}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <div className="rounded-lg border border-line bg-white/70 p-3">
                <p className="text-xs text-muted">Base Platform Fee</p>
                <p className="mt-1 font-semibold text-ink">${billing.base_price.toFixed(2)}/mo</p>
              </div>
              <div className="rounded-lg border border-line bg-white/70 p-3">
                <p className="text-xs text-muted">Active Seats ({billing.active_seats})</p>
                <p className="mt-1 font-semibold text-ink">${(billing.active_seats * billing.seat_unit_price).toFixed(2)} (${billing.seat_unit_price}/seat)</p>
              </div>
              <div className="rounded-lg border border-line bg-white/70 p-3">
                <p className="text-xs text-muted">Storage & Ingestion</p>
                <p className="mt-1 font-semibold text-ink">${billing.storage_cost.toFixed(2)} ({billing.total_pages} pages)</p>
              </div>
              <div className="rounded-lg border border-line bg-white/70 p-3">
                <p className="text-xs text-muted">RAG Queries Run</p>
                <p className="mt-1 font-semibold text-ink">{billing.total_queries} queries (Unlimited)</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
            <h3 className="display text-2xl">Billing History & Invoices</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Invoice ID</th>
                    <th className="px-4 py-2.5 font-medium">Billing Period</th>
                    <th className="px-4 py-2.5 font-medium">Issue Date</th>
                    <th className="px-4 py-2.5 font-medium">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {billing.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-4 py-3 font-mono font-medium text-ink">{inv.id}</td>
                      <td className="px-4 py-3 text-muted">{inv.period}</td>
                      <td className="px-4 py-3 text-muted">{inv.date}</td>
                      <td className="px-4 py-3 font-semibold text-ink">${inv.amount.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 uppercase">
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === "admins" && isOwner && (
        <section className="rounded-xl border border-line bg-surface p-6 shadow-sm space-y-4">
          <div>
            <h2 className="display text-2xl">Designate Organization Administrators</h2>
            <p className="mt-1 text-sm text-muted">
              As Organization Owner, manage which team members hold the tenant-wide Admin role to configure users, departments, and security policies.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Current Roles</th>
                  <th className="px-4 py-2.5 font-medium">Admin Privilege</th>
                  <th className="px-4 py-2.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => {
                  const isAdmin = u.roles.includes("admin");
                  const isUserOwner = u.roles.includes("organization_owner");
                  return (
                    <tr key={u.id} className="hover:bg-white/40">
                      <td className="px-4 py-3 font-medium text-ink">{u.name}</td>
                      <td className="px-4 py-3 text-muted">{u.email}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <span key={r} className="rounded bg-line px-1.5 py-0.5 text-[0.7rem] font-mono text-ink">
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          isAdmin ? "bg-purple-100 text-purple-800" : "bg-slate-100 text-muted"
                        }`}>
                          {isAdmin ? "Administrator" : "Standard User"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isUserOwner ? (
                          <span className="text-xs text-muted italic">Owner</span>
                        ) : (
                          <Button
                            kind={isAdmin ? "danger" : "secondary"}
                            onClick={() => toggleAdminRole(u)}
                          >
                            {isAdmin ? "Revoke Admin" : "Designate Admin"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
