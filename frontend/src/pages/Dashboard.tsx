import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Banded, Level } from "../components/ui/Classification";
import { Notice } from "../components/ui/Notice";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { DashboardStats, hasPermission, LEVELS } from "../lib/types";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const roles = user?.roles || [];
  const isAdmin = user?.is_admin || roles.includes("admin");
  const isPlatformAdmin = user?.is_platform_admin || roles.includes("platform_super_admin");
  const isOwner = roles.includes("organization_owner");
  const isIamAdmin = roles.includes("iam_admin");
  const isDocManager = roles.includes("document_manager");
  const isAuditor = roles.includes("security_auditor");
  const isDeptManager = roles.includes("department_manager");
  const isTeamLead = roles.includes("team_lead");
  const isHr = roles.includes("hr");
  const isFinance = roles.includes("finance");
  const isEngineering = roles.includes("engineering");
  const isExecutive = roles.includes("executive");
  const isEmployee = !isAdmin && !isOwner && !isIamAdmin && !isDocManager && !isAuditor && !isPlatformAdmin;

  useEffect(() => {
    setLoading(true);
    api<DashboardStats>("/dashboard/stats")
      .then(setStats)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (!user) return null;

  return (
    <div className="max-w-6xl space-y-8 pb-16">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="display text-3xl font-semibold text-ink">
              Welcome back, {user.name.split(" ")[0]}
            </h1>
            <span className="rounded-full bg-line/60 px-3 py-1 text-xs font-mono text-ink">
              {user.tenant || "Global Platform"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Logged in as <strong className="text-ink">{roles.join(", ")}</strong> • Clearance:{" "}
            <strong className="text-ink">{user.clearance_label} (Level {user.clearance})</strong>
            {user.department_id && ` • Department: ${user.department_id}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/app/ask">
            <Button kind="primary">Ask AI</Button>
          </Link>
          {hasPermission(user, "document.upload") && (
            <Link to="/app/documents">
              <Button kind="secondary">Upload Document</Button>
            </Link>
          )}
          <Link to="/app/access-requests">
            <Button kind="secondary">Access Requests</Button>
          </Link>
          {isAdmin && (
            <Link to="/app/simulator">
              <Button kind="secondary">Simulator</Button>
            </Link>
          )}
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {loading && !stats && (
        <div className="rounded-xl border border-line bg-surface p-12 text-center text-muted">
          Loading workspace intelligence...
        </div>
      )}

      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-8"
        >
          {/* Top KPI Metrics Strip */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.scope === "platform" ? (
              <>
                <div className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                  <p className="text-xs uppercase tracking-wider text-muted font-mono">Managed Tenants</p>
                  <p className="display mt-1 text-3xl font-semibold text-ink">{stats.tenants_count}</p>
                  <p className="mt-1 text-xs text-muted">{stats.active_tenants} active • {stats.suspended_tenants} suspended</p>
                </div>
                <div className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                  <p className="text-xs uppercase tracking-wider text-muted font-mono">Global Indexed Chunks</p>
                  <p className="display mt-1 text-3xl font-semibold text-ink">{stats.total_chunks}</p>
                  <p className="mt-1 text-xs text-muted">Across all isolated tenant databases</p>
                </div>
                <div className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                  <p className="text-xs uppercase tracking-wider text-muted font-mono">Total Users</p>
                  <p className="display mt-1 text-3xl font-semibold text-ink">{stats.total_users}</p>
                  <p className="mt-1 text-xs text-muted">Provisioned platform-wide</p>
                </div>
                <div className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                  <p className="text-xs uppercase tracking-wider text-muted font-mono">Platform Audit Events</p>
                  <p className="display mt-1 text-3xl font-semibold text-ink">{stats.total_audits}</p>
                  <p className="mt-1 text-xs text-muted">Immutable cross-tenant telemetry</p>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                  <p className="text-xs uppercase tracking-wider text-muted font-mono">Authorized Documents</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="display text-3xl font-semibold text-ink">{stats.accessible_documents}</span>
                    <span className="text-xs text-muted">of {stats.total_documents} total</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">Based on your clearance & roles</p>
                </div>

                <div className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                  <p className="text-xs uppercase tracking-wider text-muted font-mono">Your AI Queries</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="display text-3xl font-semibold text-ink">{stats.my_queries}</span>
                    <span className="text-xs text-muted">({stats.total_queries} org total)</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">Zero-trust cited answers</p>
                </div>

                <div className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                  <p className="text-xs uppercase tracking-wider text-muted font-mono">Pending Access Requests</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="display text-3xl font-semibold text-ink">
                      {hasPermission(user, "role.assign") || hasPermission(user, "document.grant.manage") || isAdmin
                        ? stats.pending_requests_count
                        : stats.my_requests_count}
                    </span>
                    <span className="text-xs text-muted">
                      {hasPermission(user, "role.assign") || isAdmin ? "awaiting approval" : "submitted by you"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">Role and document grants</p>
                </div>

                <div className="rounded-xl border border-line bg-surface p-5 shadow-xs">
                  <p className="text-xs uppercase tracking-wider text-muted font-mono">Security Enforcement</p>
                  <p className="display mt-1 text-3xl font-semibold text-accent">100%</p>
                  <p className="mt-1 text-xs text-muted">SQL pre-inference authorization</p>
                </div>
              </>
            )}
          </section>

          {/* Persona-Specific Workspace Sections */}

          {/* 1. PLATFORM SUPER ADMIN */}
          {isPlatformAdmin && (
            <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="display text-xl font-semibold text-ink">Multi-Tenant Management & Oversight</h2>
                  <p className="text-xs text-muted">Manage global customer tenant isolation, vector indices, and platform operations.</p>
                </div>
                <Link to="/app/platform">
                  <Button kind="primary">Open Platform Console</Button>
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 pt-2">
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Tenant Directory & Provisioning</p>
                  <p className="mt-1 text-xs text-muted">Create new organization workspaces with custom storage and model quotas.</p>
                  <Link to="/app/platform" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Manage Tenants →
                  </Link>
                </div>
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Global Security & Compliance</p>
                  <p className="mt-1 text-xs text-muted">Audit cross-tenant access attempts and monitor token throughput.</p>
                  <Link to="/app/security" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    View Global Audit →
                  </Link>
                </div>
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Emergency Tenant Killswitch</p>
                  <p className="mt-1 text-xs text-muted">Instantly isolate any tenant in case of compliance or security alert.</p>
                  <Link to="/app/platform" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Security Controls →
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* 2. ORGANIZATION OWNER */}
          {isOwner && (
            <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="display text-xl font-semibold text-ink">Executive Governance & Knowledge Assets</h2>
                  <p className="text-xs text-muted">Enterprise RAG adoption, knowledge classification distribution, and organizational policies.</p>
                </div>
                <Link to="/app/settings">
                  <Button kind="secondary">Tenant Settings</Button>
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-4 pt-2">
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs text-muted font-mono">Public (L0)</p>
                  <p className="text-2xl font-semibold text-ink">{stats.classification_counts?.public || 0}</p>
                  <p className="text-[0.7rem] text-muted">Open to all users</p>
                </div>
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs text-muted font-mono">Internal (L1)</p>
                  <p className="text-2xl font-semibold text-ink">{stats.classification_counts?.internal || 0}</p>
                  <p className="text-[0.7rem] text-muted">Standard company docs</p>
                </div>
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs text-muted font-mono">Confidential (L2)</p>
                  <p className="text-2xl font-semibold text-ink">{stats.classification_counts?.confidential || 0}</p>
                  <p className="text-[0.7rem] text-muted">Finance & Engineering</p>
                </div>
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs text-muted font-mono">Restricted (L3)</p>
                  <p className="text-2xl font-semibold text-ink">{stats.classification_counts?.restricted || 0}</p>
                  <p className="text-[0.7rem] text-muted">HR & Executive only</p>
                </div>
              </div>
            </section>
          )}

          {/* 3. IT / SYSTEM ADMIN */}
          {isAdmin && (
            <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="display text-xl font-semibold text-ink">System Administration & Ingestion Pipeline</h2>
                  <p className="text-xs text-muted">Real-time health of OCR parsers, vector embeddings, and policy simulation.</p>
                </div>
                <div className="flex gap-2">
                  <Link to="/app/simulator">
                    <Button kind="secondary">Policy Simulator</Button>
                  </Link>
                  <Link to="/app/security">
                    <Button kind="secondary">Security Suite</Button>
                  </Link>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 pt-2">
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Ingestion Pipeline</p>
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between text-muted">
                      <span>Ready & Active:</span>
                      <strong className="text-ink">{stats.ingestion_jobs?.ready || stats.document_status_counts?.active || 0}</strong>
                    </div>
                    <div className="flex justify-between text-muted">
                      <span>Processing / Queued:</span>
                      <strong className="text-ink">{(stats.ingestion_jobs?.processing || 0) + (stats.ingestion_jobs?.queued || 0)}</strong>
                    </div>
                    <div className="flex justify-between text-muted">
                      <span>Failed / Flagged:</span>
                      <strong className="text-accent">{stats.document_status_counts?.flagged || 0}</strong>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Policy Simulation Sandbox</p>
                  <p className="mt-1 text-xs text-muted">Test any employee's query against authorization SQL clauses before deployment.</p>
                  <Link to="/app/simulator" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Launch Simulator →
                  </Link>
                </div>

                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Zero-Trust Attack Tests</p>
                  <p className="mt-1 text-xs text-muted">Run automated regression attacks: prompt injection, cross-tenant, and clearance bypass.</p>
                  <Link to="/app/security" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Run Attack Suite →
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* 4. IAM ADMIN */}
          {isIamAdmin && (
            <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="display text-xl font-semibold text-ink">Identity & Access Management (IAM)</h2>
                  <p className="text-xs text-muted">Custom role builder, clearance assignments, and privilege separation.</p>
                </div>
                <Link to="/app/users-and-roles">
                  <Button kind="primary">IAM & Role Builder</Button>
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Role Assignment & Governance</p>
                  <p className="mt-1 text-xs text-muted">
                    Assign fine-grained permission keys across 12 system and custom tenant roles.
                  </p>
                  <Link to="/app/users-and-roles" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Open Role Matrix →
                  </Link>
                </div>

                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Access Approvals Queue</p>
                  <p className="mt-1 text-xs text-muted">
                    {stats.pending_requests_count} pending access requests requiring clearance or role elevation review.
                  </p>
                  <Link to="/app/access-requests" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Review Access Requests ({stats.pending_requests_count}) →
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* 5. DOCUMENT MANAGER */}
          {isDocManager && (
            <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="display text-xl font-semibold text-ink">Document Ingestion & Quarantine Hub</h2>
                  <p className="text-xs text-muted">Ingest PDFs, Scans, Excel files, and inspect files flagged for indirect prompt injection.</p>
                </div>
                <Link to="/app/documents">
                  <Button kind="primary">Document Catalog</Button>
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Quarantine & Flagged Content</p>
                  <p className="mt-1 text-xs text-muted">
                    {stats.document_status_counts?.flagged || 0} documents quarantined for potential prompt injection review.
                  </p>
                  <Link to="/app/documents" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Inspect Flagged Files →
                  </Link>
                </div>
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Access Grants Management</p>
                  <p className="mt-1 text-xs text-muted">
                    Configure document-level access grants (Role, Everyone, or Individual User).
                  </p>
                  <Link to="/app/documents" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Manage Document Grants →
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* 6. SECURITY AUDITOR */}
          {isAuditor && (
            <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="display text-xl font-semibold text-ink">Security Posture & Compliance Explorer</h2>
                  <p className="text-xs text-muted">Zero-trust audit telemetry, attack regression suite, and compliance bundle exports.</p>
                </div>
                <Link to="/app/security">
                  <Button kind="primary">Security & Audit Suite</Button>
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 pt-2">
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">24-Hour Access Denials</p>
                  <p className="text-2xl font-semibold text-ink mt-1">{stats.denials_24h}</p>
                  <p className="text-[0.7rem] text-muted">Blocked by SQL authorization pre-inference</p>
                </div>
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">SOC2 / ISO27001 Audit Export</p>
                  <p className="mt-1 text-xs text-muted">Export tamper-evident JSON and CSV audit trails.</p>
                  <a href="/api/audit/export?format=csv" download className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Download CSV Audit Log ↓
                  </a>
                </div>
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Live Attack Runner</p>
                  <p className="mt-1 text-xs text-muted">Verify SQL permission filters against adversarial queries.</p>
                  <Link to="/app/security" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Run Attack Verification →
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* 7. DEPARTMENT MANAGER & TEAM LEAD */}
          {(isDeptManager || isTeamLead) && (
            <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="display text-xl font-semibold text-ink">
                    {stats.department?.name || user.department_id || "Department"} Team Operations
                  </h2>
                  <p className="text-xs text-muted">Department personnel oversight, knowledge boundaries, and delegated access requests.</p>
                </div>
                <Link to="/app/department-insights">
                  <Button kind="primary">Department Dashboard</Button>
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 pt-2">
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Team Members</p>
                  <p className="text-2xl font-semibold text-ink mt-1">{stats.department?.members_count || 1}</p>
                  <p className="text-[0.7rem] text-muted">Assigned to this organizational unit</p>
                </div>
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Delegated Access Requests</p>
                  <p className="mt-1 text-xs text-muted">Request project-specific document access on behalf of team members.</p>
                  <Link to="/app/access-requests" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Delegate Access Request →
                  </Link>
                </div>
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Department Knowledge Base</p>
                  <p className="mt-1 text-xs text-muted">Review docs curated for this department's technical workflows.</p>
                  <Link to="/app/department-insights" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    View Department Docs →
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* 8. HR SPECIALIST */}
          {isHr && (
            <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="display text-xl font-semibold text-ink">Human Resources & Confidential Personnel Hub</h2>
                  <p className="text-xs text-muted">Level 3 Restricted compensation records, employee lifecycle, and policy Q&A.</p>
                </div>
                <div className="flex gap-2">
                  <Link to="/app/users-and-roles">
                    <Button kind="secondary">Employee Lifecycle</Button>
                  </Link>
                  <Link to="/app/documents">
                    <Button kind="primary">Restricted HR Vault</Button>
                  </Link>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Restricted Level 3 Compensation Vault</p>
                  <p className="mt-1 text-xs text-muted">
                    Salary Bands 2026 and confidential HR compensation documents protected with Level 3 Restricted clearance.
                  </p>
                  <Link to="/app/ask" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Ask HR AI (Restricted L3) →
                  </Link>
                </div>
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Employee Onboarding & Clearances</p>
                  <p className="mt-1 text-xs text-muted">
                    Provision new employee profiles, assign default clearance, and link department access.
                  </p>
                  <Link to="/app/users-and-roles" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Manage Employees ({stats.total_users}) →
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* 9. FINANCE SPECIALIST */}
          {isFinance && (
            <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="display text-xl font-semibold text-ink">Financial Intelligence & Invoice Audit</h2>
                  <p className="text-xs text-muted">Confidential Level 2 Revenue Reports, scanned supplier invoices, and fiscal audits.</p>
                </div>
                <Link to="/app/ask">
                  <Button kind="primary">Query Financial Data</Button>
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Confidential Financial Reports</p>
                  <p className="mt-1 text-xs text-muted">
                    Access FY2025 Revenue Report and balance sheets with exact table and page-level citations.
                  </p>
                  <Link to="/app/ask" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Ask: "What was our FY2025 revenue and breakdown?" →
                  </Link>
                </div>
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Scanned Invoices & Multimodal OCR</p>
                  <p className="mt-1 text-xs text-muted">
                    Inspect scanned vendor invoices with side-by-side original image previews.
                  </p>
                  <Link to="/app/documents" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    View Scanned Invoices →
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* 10. ENGINEERING SPECIALIST */}
          {isEngineering && (
            <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="display text-xl font-semibold text-ink">Platform Architecture & Technical Specifications</h2>
                  <p className="text-xs text-muted">System topologies, database schemas, code-level access rules, and API contracts.</p>
                </div>
                <Link to="/app/ask">
                  <Button kind="primary">Ask Technical AI</Button>
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Architecture Overview & Specs</p>
                  <p className="mt-1 text-xs text-muted">
                    Query platform architectures, database models, and authorization clauses with syntax highlighting.
                  </p>
                  <Link to="/app/ask" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Ask: "How is database-level access control enforced?" →
                  </Link>
                </div>
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Cross-Functional Document Access</p>
                  <p className="mt-1 text-xs text-muted">
                    Need finance APIs or restricted specs for integration? Submit 1-click access requests.
                  </p>
                  <Link to="/app/access-requests" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Request Integration Access →
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* 11. EXECUTIVE / VP */}
          {isExecutive && (
            <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="display text-xl font-semibold text-ink">Executive Strategic Intelligence Hub</h2>
                  <p className="text-xs text-muted">Cross-departmental strategic synthesis across Finance, Engineering, and Operations.</p>
                </div>
                <Link to="/app/ask">
                  <Button kind="primary">Launch Executive Briefing Q&A</Button>
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Executive Briefing Mode</p>
                  <p className="mt-1 text-xs text-muted">
                    Synthesize complex multi-page reports into structured memos: Executive Summary, Key Findings, and Financial Impact.
                  </p>
                  <Link to="/app/ask" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Open Strategic Q&A →
                  </Link>
                </div>
                <div className="rounded-lg border border-line/80 bg-bg p-4">
                  <p className="text-xs font-semibold text-ink">Confidential Knowledge Assets</p>
                  <p className="mt-1 text-xs text-muted">
                    Full Level 2 Confidential clearance across corporate revenue, platform architecture, and operational roadmaps.
                  </p>
                  <Link to="/app/documents" className="mt-3 block text-xs text-accent underline underline-offset-2">
                    Explore Confidential Catalog →
                  </Link>
                </div>
              </div>
            </section>
          )}

          {/* 12. STANDARD EMPLOYEE QUICK STARTERS */}
          <section className="space-y-4 rounded-xl border border-line bg-surface p-6">
            <h2 className="display text-xl font-semibold text-ink">Quick Knowledge Starters</h2>
            <p className="text-xs text-muted">Click any prompt to instantly query company documents with cited sources:</p>

            <div className="grid gap-3 sm:grid-cols-3 pt-2">
              <Link
                to="/app/ask"
                className="group rounded-lg border border-line/80 bg-bg p-4 hover:border-accent hover:shadow-xs transition-all"
              >
                <p className="text-xs font-medium text-ink group-hover:text-accent">
                  "How many days of annual leave do employees get?"
                </p>
                <p className="mt-1 text-[0.7rem] text-muted">Cites: Leave Policy (L1 Internal)</p>
              </Link>

              <Link
                to="/app/ask"
                className="group rounded-lg border border-line/80 bg-bg p-4 hover:border-accent hover:shadow-xs transition-all"
              >
                <p className="text-xs font-medium text-ink group-hover:text-accent">
                  "What are the steps for IT equipment setup and VPN?"
                </p>
                <p className="mt-1 text-[0.7rem] text-muted">Cites: IT Onboarding Notes (L1 Internal)</p>
              </Link>

              <Link
                to="/app/access-requests"
                className="group rounded-lg border border-line/80 bg-bg p-4 hover:border-accent hover:shadow-xs transition-all"
              >
                <p className="text-xs font-medium text-ink group-hover:text-accent">
                  Need access to a restricted document?
                </p>
                <p className="mt-1 text-[0.7rem] text-muted">Submit an access request with business justification</p>
              </Link>
            </div>
          </section>
        </motion.div>
      )}
    </div>
  );
}
