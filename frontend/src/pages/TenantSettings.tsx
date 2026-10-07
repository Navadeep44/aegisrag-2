import { useEffect, useState } from "react";
import { Building2, CreditCard, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatCard } from "../components/ui/StatCard";
import { StatusPill, RolePill } from "../components/ui/StatusPill";
import { DataTable, type Column } from "../components/ui/DataTable";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/Toast";
import { inputClass } from "../components/ui/field";
import { useAuth } from "../context/AuthContext";
import { api, patch, post } from "../lib/api";
import type { TenantBilling, TenantInfo, TenantUsage, User } from "../lib/types";

export default function TenantSettings() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<"settings" | "billing" | "admins">("settings");
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [billing, setBilling] = useState<TenantBilling | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // Form state
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [website, setWebsite] = useState("");
  const [industryCategory, setIndustryCategory] = useState("technology");
  const [maxUpload, setMaxUpload] = useState(25);
  const [retentionDays, setRetentionDays] = useState(90);
  const [initialState, setInitialState] = useState({
    name: "",
    logoUrl: "",
    website: "",
    industryCategory: "technology",
    maxUpload: 25,
    retentionDays: 90,
  });
  const [saving, setSaving] = useState(false);

  // Admin confirmation dialog state
  const [adminToRevoke, setAdminToRevoke] = useState<User | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const isOwner = user?.roles?.includes("organization_owner") || user?.is_platform_admin || user?.is_admin;

  const isPristine =
    name === initialState.name &&
    logoUrl === initialState.logoUrl &&
    website === initialState.website &&
    industryCategory === initialState.industryCategory &&
    maxUpload === initialState.maxUpload &&
    retentionDays === initialState.retentionDays;

  const loadData = () => {
    api<TenantInfo>("/tenant/settings")
      .then((t) => {
        setTenant(t);
        setName(t.name);
        setLogoUrl(t.logo_url || "");
        setWebsite(t.website || "");
        setIndustryCategory(t.industry_category || "technology");
        const up = Number(t.settings?.max_upload_mb ?? 25);
        const ret = Number(t.settings?.retention_days ?? 90);
        setMaxUpload(up);
        setRetentionDays(ret);
        setInitialState({
          name: t.name,
          logoUrl: t.logo_url || "",
          website: t.website || "",
          industryCategory: t.industry_category || "technology",
          maxUpload: up,
          retentionDays: ret,
        });
      })
      .catch((e) => showToast(e.message, "error"));

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

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast("Logo file must be under 2MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setLogoUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const updated = await patch<TenantInfo>("/tenant/settings", {
        name: name.trim(),
        logo_url: logoUrl.trim() || null,
        website: website.trim() || null,
        industry_category: industryCategory.trim() || null,
        settings: {
          max_upload_mb: Number(maxUpload),
          retention_days: Number(retentionDays),
        },
      });
      setTenant(updated);
      setInitialState({
        name: updated.name,
        logoUrl: updated.logo_url || "",
        website: updated.website || "",
        industryCategory: updated.industry_category || "technology",
        maxUpload: Number(maxUpload),
        retentionDays: Number(retentionDays),
      });
      showToast("Organization branding & settings saved successfully.", "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAdminRole(targetUser: User) {
    const isCurrentlyAdmin = targetUser.roles.includes("admin");
    if (isCurrentlyAdmin) {
      setAdminToRevoke(targetUser);
      return;
    }

    try {
      await post("/tenant/admins", { user_id: targetUser.id, action: "assign" });
      showToast(`Designated ${targetUser.name} as Administrator.`, "success");
      loadData();
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }

  async function confirmRevokeAdmin() {
    if (!adminToRevoke) return;
    setIsRevoking(true);
    try {
      await post("/tenant/admins", { user_id: adminToRevoke.id, action: "revoke" });
      showToast(`Revoked admin privileges from ${adminToRevoke.name}.`, "info");
      setAdminToRevoke(null);
      loadData();
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setIsRevoking(false);
    }
  }

  const invoiceColumns: Column<NonNullable<TenantBilling["invoices"]>[number]>[] = [
    {
      key: "id",
      header: "Invoice ID",
      render: (inv) => <span className="font-mono font-medium text-ink">{inv.id}</span>,
    },
    {
      key: "period",
      header: "Billing Period",
      render: (inv) => <span className="text-muted text-xs">{inv.period}</span>,
    },
    {
      key: "date",
      header: "Issue Date",
      render: (inv) => <span className="text-muted text-xs">{inv.date}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      render: (inv) => <span className="font-semibold text-ink">${inv.amount.toFixed(2)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (inv) => <StatusPill status={inv.status} />,
    },
  ];

  const adminColumns: Column<User>[] = [
    {
      key: "user",
      header: "Member",
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-subtle border border-line text-xs font-semibold text-ink">
            {u.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </div>
          <div>
            <p className="font-medium text-ink">{u.name}</p>
            <p className="font-mono text-xs text-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "roles",
      header: "Current Roles",
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles.map((r) => (
            <RolePill key={r} role={r} />
          ))}
        </div>
      ),
    },
    {
      key: "status",
      header: "Admin Status",
      render: (u) => {
        const isAdmin = u.roles.includes("admin");
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isAdmin ? "bg-purple-50 text-purple-800 border border-purple-200" : "bg-surface-subtle text-muted"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isAdmin ? "bg-purple-600" : "bg-slate-400"}`} />
            {isAdmin ? "Administrator" : "Standard User"}
          </span>
        );
      },
    },
    {
      key: "action",
      header: "Actions",
      className: "text-right",
      headerClassName: "text-right",
      render: (u) => {
        const isAdmin = u.roles.includes("admin");
        const isUserOwner = u.roles.includes("organization_owner");

        if (isUserOwner) {
          return <span className="text-xs font-mono text-muted italic">Organization Owner</span>;
        }

        return (
          <Button
            kind={isAdmin ? "danger" : "secondary"}
            onClick={() => toggleAdminRole(u)}
          >
            {isAdmin ? "Revoke Admin" : "Designate Admin"}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        title="Organization Settings"
        subtitle="Manage your organization profile, ingestion quotas, subscription billing, and administrator designations."
      />

      {/* Tabs */}
      <div className="flex border-b border-line gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 pb-3 transition-colors border-b-2 ${
            activeTab === "settings"
              ? "border-ink text-ink font-semibold"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          <Building2 className="h-4 w-4" />
          General & Limits
        </button>
        <button
          onClick={() => setActiveTab("billing")}
          className={`flex items-center gap-2 pb-3 transition-colors border-b-2 ${
            activeTab === "billing"
              ? "border-ink text-ink font-semibold"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          <CreditCard className="h-4 w-4" />
          Usage & Billing
        </button>
        {isOwner && (
          <button
            onClick={() => setActiveTab("admins")}
            className={`flex items-center gap-2 pb-3 transition-colors border-b-2 ${
              activeTab === "admins"
                ? "border-ink text-ink font-semibold"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            Organization Administrators
          </button>
        )}
      </div>

      {/* Tab: General & Limits */}
      {activeTab === "settings" && (
        <div className="space-y-8">
          {usage && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Active Users"
                value={usage.users_count}
                subtext="Members in your workspace"
              />
              <StatCard
                label="Catalog Documents"
                value={usage.documents_count}
                subtext="Ingested & searchable"
              />
              <StatCard
                label="Total Queries"
                value={usage.queries_count}
                subtext="Questions answered"
              />
              <StatCard
                label="Rendered Pages"
                value={usage.total_rendered_pages}
                subtext="OCR & indexed pages"
              />
            </div>
          )}

          <SectionCard
            title="Organization Profile & Identity"
            subtitle="Configure your company branding, white-label logo, industry category, and ingestion quotas."
          >
            <form onSubmit={handleSave} className="space-y-6 max-w-xl">
              <div>
                <label className="block text-sm font-medium text-ink">
                  Organization Display Name
                  <input
                    required
                    className={`${inputClass} mt-1.5`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              </div>

              {/* Industry Category */}
              <div>
                <label className="block text-sm font-medium text-ink">
                  Industry Category
                  <select
                    className={`${inputClass} mt-1.5`}
                    value={industryCategory}
                    onChange={(e) => setIndustryCategory(e.target.value)}
                  >
                    <option value="healthcare">Healthcare & Life Sciences</option>
                    <option value="finance">Finance, Banking & FinTech</option>
                    <option value="legal">Legal & Compliance Advisory</option>
                    <option value="defense">Defense & Public Safety</option>
                    <option value="technology">Technology & SaaS Engineering</option>
                    <option value="pharma">Pharmaceuticals & Clinical Trials</option>
                  </select>
                </label>
              </div>

              {/* Company Logo Upload & Live Preview */}
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Company Logo</label>
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-subtle p-1.5 overflow-hidden shadow-xs">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Company Logo" className="h-full w-full object-contain" />
                    ) : (
                      <span className="font-mono text-xs font-bold text-muted">
                        {(name || "CO").slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      onChange={handleLogoUpload}
                      className="block w-full text-xs text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-surface-subtle file:text-ink hover:file:bg-line cursor-pointer"
                    />
                    <input
                      type="url"
                      placeholder="Or enter logo image URL (https://...)"
                      className={`${inputClass} text-xs`}
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Company Website */}
              <div>
                <label className="block text-sm font-medium text-ink">
                  Company Website (Optional)
                  <input
                    type="url"
                    placeholder="https://example.com"
                    className={`${inputClass} mt-1.5`}
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
              </div>

              <div className="pt-4 border-t border-line space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-muted">Ingestion Quotas & Retention</h4>
                <div>
                  <label className="block text-sm font-medium text-ink">
                    Maximum Upload File Size (MB)
                    <input
                      type="number"
                      min={1}
                      max={100}
                      className={`${inputClass} mt-1.5`}
                      value={maxUpload}
                      onChange={(e) => setMaxUpload(Number(e.target.value))}
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink">
                    Data & Audit Retention Period (Days)
                    <input
                      type="number"
                      min={7}
                      max={365}
                      className={`${inputClass} mt-1.5`}
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={isPristine || saving}>
                  {saving ? "Saving Changes..." : "Save Settings"}
                </Button>
              </div>
            </form>
          </SectionCard>
        </div>
      )}

      {/* Tab: Usage & Billing */}
      {activeTab === "billing" && billing && (
        <div className="space-y-8">
          <SectionCard>
            <div className="flex flex-wrap items-center justify-between gap-6 border-b border-line pb-6">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="display text-3xl font-semibold text-ink">{billing.plan}</h3>
                  <StatusPill status={billing.status} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  Billed {billing.billing_cycle.toLowerCase()} • Next scheduled invoice on {billing.next_invoice_date}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider font-mono text-muted">Estimated Current Month</p>
                <p className="display text-3xl font-bold text-ink">${billing.estimated_monthly_total.toFixed(2)}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-line bg-surface-subtle p-4">
                <p className="text-xs uppercase tracking-wider font-mono text-muted">Base Platform</p>
                <p className="mt-1.5 text-lg font-semibold text-ink">${billing.base_price.toFixed(2)}/mo</p>
                <p className="mt-0.5 text-xs text-muted">Core infrastructure</p>
              </div>
              <div className="rounded-xl border border-line bg-surface-subtle p-4">
                <p className="text-xs uppercase tracking-wider font-mono text-muted">Active Seats ({billing.active_seats})</p>
                <p className="mt-1.5 text-lg font-semibold text-ink">
                  ${(billing.active_seats * billing.seat_unit_price).toFixed(2)}
                </p>
                <p className="mt-0.5 text-xs text-muted">${billing.seat_unit_price}/seat per month</p>
              </div>
              <div className="rounded-xl border border-line bg-surface-subtle p-4">
                <p className="text-xs uppercase tracking-wider font-mono text-muted">Storage & Ingestion</p>
                <p className="mt-1.5 text-lg font-semibold text-ink">${billing.storage_cost.toFixed(2)}</p>
                <p className="mt-0.5 text-xs text-muted">{billing.total_pages} pages indexed</p>
              </div>
              <div className="rounded-xl border border-line bg-surface-subtle p-4">
                <p className="text-xs uppercase tracking-wider font-mono text-muted">RAG Queries</p>
                <p className="mt-1.5 text-lg font-semibold text-ink">{billing.total_queries} queries</p>
                <p className="mt-0.5 text-xs text-emerald-700 font-medium">Included with plan</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Billing History & Invoices"
            subtitle="Past invoices generated for your organization."
          >
            <DataTable
              columns={invoiceColumns}
              data={billing.invoices || []}
              keyExtractor={(inv) => inv.id}
              emptyMessage="No billing history available yet."
            />
          </SectionCard>
        </div>
      )}

      {/* Tab: Organization Administrators */}
      {activeTab === "admins" && isOwner && (
        <div className="space-y-6">
          <SectionCard
            title="Designate Organization Administrators"
            subtitle="Manage which team members hold the tenant-wide Admin role to configure users, departments, and security policies."
          >
            <DataTable
              columns={adminColumns}
              data={users}
              keyExtractor={(u) => u.id}
              emptyMessage="No users found in organization."
            />
          </SectionCard>
        </div>
      )}

      {/* Confirm Revoke Admin Dialog */}
      <ConfirmDialog
        isOpen={Boolean(adminToRevoke)}
        title="Revoke Administrator Privileges"
        description={`Are you sure you want to remove administrator privileges from ${adminToRevoke?.name}? They will lose access to organization settings, user administration, and security configurations.`}
        confirmText={isRevoking ? "Revoking..." : "Revoke Privileges"}
        tone="danger"
        busy={isRevoking}
        onConfirm={confirmRevokeAdmin}
        onClose={() => setAdminToRevoke(null)}
      />
    </div>
  );
}
