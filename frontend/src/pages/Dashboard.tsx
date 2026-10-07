import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Upload,
  KeyRound,
  SlidersHorizontal,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Shield,
  FileText,
  Users,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { StatCard } from "../components/ui/StatCard";
import { ClearancePill, RolePill, StatusPill } from "../components/ui/StatusPill";
import { StatCardSkeleton } from "../components/ui/Skeleton";
import { Notice } from "../components/ui/Notice";
import { PinnedSteps } from "../components/motion/PinnedSteps";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { DashboardStats, hasPermission } from "../lib/types";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  const canUpload = hasPermission(user, "document.upload");
  const canAssign = hasPermission(user, "role.assign");
  const canSimulate = hasPermission(user, "policy.simulate") || isAdmin || isIamAdmin;
  const canRunTests = hasPermission(user, "security_tests.run") || isAdmin || isAuditor;

  useEffect(() => {
    setLoading(true);
    api<DashboardStats>("/dashboard/stats")
      .then(setStats)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (!user) return null;

  // Personalized starter queries
  const starterQueries = isFinance
    ? [
        "What was our annual revenue in FY2025?",
        "What is the total on the Apex Solutions invoice?",
        "What are the payment terms in the scanned invoice?",
      ]
    : isHr
    ? [
        "What is the salary band for a Senior Software Engineer (Level 4)?",
        "How many days of annual leave do employees get?",
        "What are the requirements for parental leave?",
      ]
    : isEngineering
    ? [
        "Which three services does the platform run on?",
        "How is database-level access control enforced?",
        "What database configurations are supported?",
      ]
    : [
        "How many days of annual leave do employees get?",
        "What are the IT onboarding steps for new laptops?",
        "Who do I contact for IT support and VPN setup?",
      ];

  const firstName = user.name.split(" ")[0];

  // Ingestion status summary numbers
  const readyDocs = stats?.ingestion_jobs?.ready ?? stats?.document_status_counts?.active ?? stats?.accessible_documents ?? 0;
  const processingDocs = (stats?.ingestion_jobs?.processing ?? 0) + (stats?.ingestion_jobs?.queued ?? 0);
  const flaggedDocs = stats?.document_status_counts?.flagged ?? 0;

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Greeting Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="display text-3xl sm:text-4xl font-semibold text-ink">
              Welcome back, {firstName}
            </h1>
            <div className="flex items-center gap-1.5">
              <ClearancePill clearance={user.clearance} label={user.clearance_label} />
              {roles.slice(0, 2).map((r) => (
                <RolePill key={r} role={r} />
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted">
            {user.tenant || "Global Platform"} {user.department_id ? `• ${user.department_id} Department` : ""}
          </p>
        </div>

        {/* Single Hero Primary Action */}
        <div className="flex items-center gap-3">
          <Link to="/app/ask">
            <Button kind="primary" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span>Ask AI</span>
            </Button>
          </Link>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {/* 2. Loading State */}
      {loading && !stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      )}

      {/* 3. Stat Cards Strip */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-8"
        >
          {stats.scope === "platform" ? (
            <section aria-label="Platform metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Managed Organizations"
                value={stats.tenants_count ?? 0}
                subtext={`${stats.active_tenants ?? 0} active • ${stats.suspended_tenants ?? 0} suspended`}
              />
              <StatCard
                label="Indexed Knowledge Chunks"
                value={stats.total_chunks ?? 0}
                subtext="Across all isolated organization databases"
              />
              <StatCard
                label="Provisioned Users"
                value={stats.total_users ?? 0}
                subtext="Total members across organizations"
              />
              <StatCard
                label="Audit Events"
                value={stats.total_audits ?? 0}
                subtext="Tamper-evident activity log"
              />
            </section>
          ) : (
            <section aria-label="Workspace stats" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Documents you can read"
                value={stats.accessible_documents ?? 0}
                total={stats.total_documents}
                subtext="Matched to your clearance & active roles"
                tone="default"
              />

              <StatCard
                label="Your questions asked"
                value={stats.my_queries ?? 0}
                subtext={`${stats.total_queries ?? 0} total questions in organization`}
                tone="default"
              />

              <StatCard
                label="Pending access requests"
                value={
                  canAssign || isAdmin
                    ? stats.pending_requests_count ?? 0
                    : stats.my_requests_count ?? 0
                }
                subtext={
                  canAssign || isAdmin
                    ? "Awaiting your review"
                    : "Requests submitted by you"
                }
                tone={stats.pending_requests_count ? "amber" : "default"}
                onClick={() => navigate("/app/access-requests")}
              />

              {/* Ingestion & Protection Health Card */}
              <div className="rounded-xl border border-line bg-surface p-5 shadow-xs space-y-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted font-mono">
                      Knowledge Health
                    </p>
                    <span
                      title="Access checks run before retrieval"
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-800 border border-emerald-200"
                    >
                      <Shield className="h-3 w-3" />
                      Protected
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted space-y-1">
                    <div className="flex items-center justify-between">
                      <span>Ready to search:</span>
                      <strong className="text-ink font-medium">{readyDocs}</strong>
                    </div>
                    {processingDocs > 0 && (
                      <div className="flex items-center justify-between text-sky-700">
                        <span>Processing:</span>
                        <strong>{processingDocs}</strong>
                      </div>
                    )}
                    {flaggedDocs > 0 ? (
                      <div className="flex items-center justify-between text-amber-700 font-medium">
                        <span>Flagged for review:</span>
                        <strong>{flaggedDocs}</strong>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-muted">
                        <span>Flagged:</span>
                        <span>0</span>
                      </div>
                    )}
                  </div>
                </div>
                <Link
                  to="/app/documents"
                  className="text-xs text-accent hover:underline flex items-center gap-1 font-medium pt-1"
                >
                  <span>View catalog</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </section>
          )}

          {/* 4. Quick Actions Row (Role-Gated, No Duplication) */}
          {(canUpload || canAssign || canSimulate || canRunTests) && (
            <section aria-label="Quick actions" className="rounded-xl border border-line bg-surface p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs uppercase tracking-wider text-muted font-mono font-semibold">
                  Quick Actions
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {canUpload && (
                  <Link
                    to="/app/documents"
                    className="group flex items-center gap-3 rounded-lg border border-line bg-surface-subtle/50 p-3 hover:border-ink hover:bg-surface transition-all shadow-xs"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink text-white">
                      <Upload className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-ink group-hover:text-accent block">
                        Upload document
                      </span>
                      <span className="text-[0.7rem] text-muted truncate block">
                        Add to knowledge base
                      </span>
                    </div>
                  </Link>
                )}

                {(canAssign || isAdmin) && (
                  <Link
                    to="/app/access-requests"
                    className="group flex items-center gap-3 rounded-lg border border-line bg-surface-subtle/50 p-3 hover:border-ink hover:bg-surface transition-all shadow-xs"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink text-white">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-ink group-hover:text-accent block">
                        Review requests
                      </span>
                      <span className="text-[0.7rem] text-muted truncate block">
                        {stats.pending_requests_count ?? 0} waiting approval
                      </span>
                    </div>
                  </Link>
                )}

                {canSimulate && (
                  <Link
                    to="/app/simulator"
                    className="group flex items-center gap-3 rounded-lg border border-line bg-surface-subtle/50 p-3 hover:border-ink hover:bg-surface transition-all shadow-xs"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink text-white">
                      <SlidersHorizontal className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-ink group-hover:text-accent block">
                        Check access
                      </span>
                      <span className="text-[0.7rem] text-muted truncate block">
                        Test who can see what
                      </span>
                    </div>
                  </Link>
                )}

                {canRunTests && (
                  <Link
                    to="/app/security"
                    className="group flex items-center gap-3 rounded-lg border border-line bg-surface-subtle/50 p-3 hover:border-ink hover:bg-surface transition-all shadow-xs"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink text-white">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-ink group-hover:text-accent block">
                        Run security checks
                      </span>
                      <span className="text-[0.7rem] text-muted truncate block">
                        Verify 17 attack tests
                      </span>
                    </div>
                  </Link>
                )}
              </div>
            </section>
          )}

          {/* 5. "Try Asking" Starter Queries */}
          <section aria-label="Suggested questions" className="rounded-xl border border-line bg-surface p-6 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="display text-xl font-semibold text-ink">Try asking</h2>
                <p className="text-xs text-muted">
                  Click any starter prompt to query your authorized documents:
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 pt-1">
              {starterQueries.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => navigate(`/app/ask?q=${encodeURIComponent(q)}`)}
                  className="group flex flex-col justify-between text-left rounded-lg border border-line bg-surface-subtle/60 p-3.5 hover:border-accent hover:bg-surface hover:shadow-xs transition-all"
                >
                  <p className="text-xs font-medium text-ink group-hover:text-accent leading-relaxed">
                    "{q}"
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[0.7rem] text-muted">
                    <span>Ask AI</span>
                    <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* 6. Pinned Scroll Section: "How your answer is protected" */}
          <PinnedSteps />
        </motion.div>
      )}
    </div>
  );
}
