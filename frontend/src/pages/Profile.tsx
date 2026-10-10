import { useState } from "react";
import { motion } from "framer-motion";
import { LogOut, Search, CheckCircle2 } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { UserRound as UserRoundIcon } from "lucide-react";
import { SectionCard } from "../components/ui/SectionCard";
import { Button } from "../components/ui/Button";
import { StatusPill, RolePill, ClearancePill } from "../components/ui/StatusPill";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  if (!user) return null;

  const clearanceExplanations: Record<number, string> = {
    0: "Access to public announcements, marketing materials, and general knowledge.",
    1: "Access to internal company guidelines, handbooks, and general department docs.",
    2: "Access to confidential business operations, roadmaps, and departmental files.",
    3: "Access to executive strategies, legal agreements, and restricted financial records.",
  };

  const filteredPermissions = (user.permissions || []).filter((p) =>
    p.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        icon={UserRoundIcon}
        title="My Profile"
        subtitle="Identity, clearance and permissions."
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Identity & Workspace Card */}
        <SectionCard
          title="Identity & Workspace"
          subtitle="Your personal profile information within this workspace."
        >
          <div className="flex items-center gap-4 border-b border-line pb-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-subtle border border-line text-lg font-bold text-ink">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div>
              <h3 className="display text-xl font-semibold text-ink">{user.name}</h3>
              <p className="font-mono text-xs text-muted">{user.email}</p>
            </div>
          </div>

          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-xs uppercase tracking-wider font-mono text-muted">Organization</dt>
              <dd className="font-medium text-ink">{user.tenant}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs uppercase tracking-wider font-mono text-muted">Department</dt>
              <dd className="font-medium text-ink">{user.department_id || "General"}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs uppercase tracking-wider font-mono text-muted">Account Status</dt>
              <dd>
                <StatusPill status={user.status} />
              </dd>
            </div>
          </dl>
        </SectionCard>

        {/* Security Attributes Card */}
        <SectionCard
          title="Security & Clearance"
          subtitle="Your authorization tier and assigned organizational roles."
        >
          <div className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-wider font-mono text-muted">Clearance Tier</p>
              <div className="mt-2 flex items-center gap-2.5">
                <ClearancePill clearance={user.clearance} label={user.clearance_label} />
              </div>
              <p className="mt-2 text-xs text-muted leading-relaxed">
                {clearanceExplanations[user.clearance] || "Standard clearance privileges."}
              </p>
            </div>

            <div className="border-t border-line pt-4">
              <p className="text-xs uppercase tracking-wider font-mono text-muted">Assigned Roles</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {user.roles.map((r) => (
                  <RolePill key={r} role={r} />
                ))}
              </div>
            </div>

            <div className="border-t border-line pt-4">
              <p className="text-xs uppercase tracking-wider font-mono text-muted">Privilege Scope</p>
              <p className="mt-1 text-sm font-medium text-ink">
                {user.is_platform_admin
                  ? "Global Platform Operator"
                  : user.is_admin
                  ? "Organization Administrator"
                  : "Standard Scoped Member"}
              </p>
            </div>

            <div className="border-t border-line pt-4">
              <Button
                kind="secondary"
                onClick={() => {
                  signOut();
                  navigate("/signin");
                }}
              >
                <LogOut className="h-3.5 w-3.5 mr-1.5" />
                Sign out / Switch Persona
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Effective Permissions Card */}
      <SectionCard
        title={`Effective Permissions (${user.permissions?.length || 0})`}
        subtitle="Computed dynamically on the server from your active role bindings. Frontend visibility never overrides database-level access checks."
      >
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search permissions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface-subtle py-2 pl-9 pr-3 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            />
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPermissions.map((perm, i) => (
              <motion.div
                key={perm}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.015 * Math.min(i, 20) }}
                className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-subtle/50 px-3 py-2.5 text-xs font-mono text-ink"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">{perm}</span>
              </motion.div>
            ))}
            {filteredPermissions.length === 0 && (
              <p className="col-span-full py-4 text-center text-xs text-muted">
                No matching permissions found.
              </p>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
