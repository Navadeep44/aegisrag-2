import { motion } from "framer-motion";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <div className="max-w-4xl space-y-8 pb-12">
      <PageHeader title="My Profile">
        Identity, organization membership, clearance tier, and server-side computed permissions.
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
          <h2 className="display text-2xl">Identity & Tenant</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Full Name</dt>
              <dd className="font-medium text-ink">{user.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Email</dt>
              <dd className="font-mono text-ink">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Organization / Tenant</dt>
              <dd className="font-medium text-ink">{user.tenant}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Department</dt>
              <dd className="text-ink">{user.department_id || "General"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Account Status</dt>
              <dd>
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${user.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                  {user.status}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
          <h2 className="display text-2xl">Security Attributes</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Clearance Level</dt>
              <dd className="font-medium text-ink">
                Level {user.clearance} — {user.clearance_label}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Assigned Roles</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {user.roles.map((r) => (
                  <span key={r} className="rounded-md border border-line bg-white px-2 py-0.5 text-xs font-medium text-ink shadow-xs">
                    {r}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Privilege Scope</dt>
              <dd className="text-ink">
                {user.is_platform_admin ? "Global Platform Operator" : user.is_admin ? "Tenant Administrator" : "Standard Scoped Member"}
              </dd>
            </div>
            <div className="pt-2">
              <Button kind="secondary" onClick={() => { signOut(); navigate("/signin"); }}>
                Sign out / Switch Persona
              </Button>
            </div>
          </dl>
        </section>
      </div>

      <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex items-baseline justify-between border-b border-line pb-3">
          <h2 className="display text-2xl">Effective Permissions ({user.permissions?.length || 0})</h2>
          <span className="text-xs text-muted">Computed server-side from active role bindings</span>
        </div>
        <p className="mt-2 text-xs text-muted">
          AegisRAG enforces permissions at the API and SQL layer. Frontend visibility is never treated as security.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {(user.permissions || []).map((perm, i) => (
            <motion.div
              key={perm}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.02 * i }}
              className="flex items-center gap-2 rounded-md border border-line bg-white/60 px-3 py-2 text-xs font-mono text-ink"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate">{perm}</span>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
