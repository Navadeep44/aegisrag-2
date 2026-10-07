import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Upload,
  KeyRound,
  ShieldCheck,
  ArrowRight,
  Shield,
  FileText,
  Users,
  Search,
  Globe,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { ClearancePill, RolePill } from "../components/ui/StatusPill";
import { Notice } from "../components/ui/Notice";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { DashboardStats, hasPermission } from "../lib/types";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const roles = user?.roles || [];
  const isAdmin = user?.is_admin || roles.includes("admin");
  const isOwner = roles.includes("organization_owner");
  const isIamAdmin = roles.includes("iam_admin");
  const isAuditor = roles.includes("security_auditor");

  const canUpload = hasPermission(user, "document.upload");
  const canAssign = hasPermission(user, "role.assign");
  const canManageRoles = isAdmin || isOwner || isIamAdmin;

  useEffect(() => {
    setLoading(true);
    api<DashboardStats>("/dashboard/stats")
      .then(setStats)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (!user) return null;

  const firstName = user.name.split(" ")[0];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    navigate(`/app/ask?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const starterPrompts = [
    "What are our standard operating guidelines?",
    "Summarize the latest compliance directives",
    "What are the emergency protocols?",
  ];

  return (
    <div className="space-y-8 pb-12 max-w-6xl mx-auto">
      {/* 1. Header & Identity */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Welcome back, {firstName}
            </h1>
            <ClearancePill clearance={user.clearance} label={user.clearance_label} />
            {roles.slice(0, 1).map((r) => (
              <RolePill key={r} role={r} />
            ))}
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted">
            {user.tenant || "Enterprise Workspace"}
          </p>
        </div>

        <Link to="/app/ask">
          <Button kind="primary" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span>Open Ask AI</span>
          </Button>
        </Link>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {/* 2. Central Hero Search Bar (Immediate, Intuitive Flow) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-xs space-y-4"
      >
        <div className="max-w-2xl space-y-1">
          <h2 className="text-lg sm:text-xl font-semibold text-ink">
            Ask anything about your documents
          </h2>
          <p className="text-xs sm:text-sm text-muted">
            Answers cite verified passages matched strictly to your security clearance.
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="relative flex items-center">
            <Search className="absolute left-4 h-5 w-5 text-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type your question here... e.g. What are the clinical guidelines?"
              className="w-full rounded-xl border border-line bg-surface-subtle/40 pl-11 pr-28 py-3.5 text-sm text-ink placeholder:text-muted focus:border-ink focus:bg-surface focus:outline-none transition-all shadow-inner"
            />
            <button
              type="submit"
              disabled={!searchQuery.trim()}
              className="absolute right-2 rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Ask
            </button>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-muted font-medium">Quick suggestions:</span>
          {starterPrompts.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => navigate(`/app/ask?q=${encodeURIComponent(prompt)}`)}
              className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink/80 hover:border-ink hover:text-ink transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      </motion.div>

      {/* 3. Core Overview Metrics (Clean & Uncluttered) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface p-5 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-muted text-xs font-medium uppercase tracking-wider">
            <span>Documents Available</span>
            <FileText className="h-4 w-4" />
          </div>
          <div className="text-3xl font-bold text-ink">
            {stats?.accessible_documents ?? 0}
            <span className="text-xs font-normal text-muted ml-1.5">
              / {stats?.total_documents ?? 0} in catalog
            </span>
          </div>
          <p className="text-xs text-muted pt-1">Searchable with your role & clearance</p>
        </div>

        <div className="rounded-xl border border-line bg-surface p-5 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-muted text-xs font-medium uppercase tracking-wider">
            <span>Questions Answered</span>
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="text-3xl font-bold text-ink">
            {stats?.my_queries ?? 0}
            <span className="text-xs font-normal text-muted ml-1.5">
              by your profile
            </span>
          </div>
          <p className="text-xs text-muted pt-1">Grounded with exact page citations</p>
        </div>

        <div className="rounded-xl border border-line bg-surface p-5 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-muted text-xs font-medium uppercase tracking-wider">
            <span>Security Status</span>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-bold text-ink flex items-center gap-2">
            <span>Protected</span>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </div>
          <p className="text-xs text-muted pt-1">Pre-retrieval SQL ACL enforcement active</p>
        </div>
      </div>

      {/* 4. Quick Actions Row */}
      <div className="rounded-xl border border-line bg-surface p-5 shadow-xs space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Quick Actions
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {canUpload && (
            <Link
              to="/app/documents"
              className="flex items-center gap-3 rounded-lg border border-line bg-surface-subtle/50 p-3.5 hover:border-ink hover:bg-surface transition-all group"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white shrink-0">
                <Upload className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink group-hover:text-accent truncate">
                  Upload Document
                </p>
                <p className="text-[0.7rem] text-muted truncate">
                  Ingest PDF or Database Records
                </p>
              </div>
            </Link>
          )}

          {canManageRoles && (
            <Link
              to="/app/roles-hub"
              className="flex items-center gap-3 rounded-lg border border-line bg-surface-subtle/50 p-3.5 hover:border-ink hover:bg-surface transition-all group"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white shrink-0">
                <Globe className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink group-hover:text-accent truncate">
                  Role Portals & URLs
                </p>
                <p className="text-[0.7rem] text-muted truncate">
                  Manage shareable login links
                </p>
              </div>
            </Link>
          )}

          <Link
            to="/app/access-requests"
            className="flex items-center gap-3 rounded-lg border border-line bg-surface-subtle/50 p-3.5 hover:border-ink hover:bg-surface transition-all group"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white shrink-0">
              <KeyRound className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink group-hover:text-accent truncate">
                Access Requests
              </p>
              <p className="text-[0.7rem] text-muted truncate">
                {stats?.pending_requests_count ? `${stats.pending_requests_count} pending review` : "Review clearances"}
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
