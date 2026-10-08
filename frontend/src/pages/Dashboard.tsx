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

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

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
    <div className="space-y-10 pb-16 max-w-6xl mx-auto">
      {/* 1. Header & Identity Card */}
      <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-sm flex flex-wrap items-center justify-between gap-6 relative overflow-hidden">
        {/* Decorative Background Element */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-accent opacity-5 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="space-y-2 relative z-10">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Hello, {firstName}
            </h1>
            <ClearancePill clearance={user.clearance} label={user.clearance_label} />
            {roles.slice(0, 1).map((r) => (
              <RolePill key={r} role={r} />
            ))}
          </div>
          <p className="text-sm text-muted font-medium">
            {user.tenant || "Enterprise Workspace"}
          </p>
        </div>

        <Link to="/app/ask" className="relative z-10">
          <Button kind="primary" className="flex items-center gap-2 shadow-sm bg-accent hover:bg-accent-hover text-surface cursor-pointer py-2.5 px-5">
            <Sparkles className="h-4.5 w-4.5" />
            <span className="font-semibold">Ask AI</span>
          </Button>
        </Link>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {/* 2. Hero Search Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-3xl border border-line section-gradient p-8 sm:p-10 shadow-md space-y-6 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent pointer-events-none"></div>
        
        <div className="flex items-center justify-between relative z-10">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold text-ink">
              Ask Your Knowledge Base
            </h2>
            <p className="text-sm text-muted">
              Instant answers grounded in your authorized documents
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-accent-light px-3 py-1.5 text-xs font-semibold text-accent">
            <Sparkles className="h-3.5 w-3.5" />
            AI Retrieval
          </span>
        </div>

        <form onSubmit={handleSearchSubmit} className="relative z-10">
          <div className="relative flex items-center group">
            <Search className="absolute left-5 h-6 w-6 text-muted-light group-focus-within:text-accent transition-colors pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ask a question... e.g. What is our leave policy?"
              className="w-full rounded-2xl border-2 border-line bg-surface pl-14 pr-28 py-4 text-base text-ink placeholder:text-muted focus:border-accent focus:bg-surface focus:outline-none transition-all shadow-xs focus:shadow-sm"
            />
            <button
              type="submit"
              disabled={!searchQuery.trim()}
              className="absolute right-2 rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-surface transition-all hover:bg-accent-hover hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 cursor-pointer"
            >
              Ask
            </button>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2.5 pt-2 relative z-10">
          <span className="text-sm text-muted font-medium">Try asking:</span>
          {starterPrompts.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => navigate(`/app/ask?q=${encodeURIComponent(prompt)}`)}
              className="rounded-full border border-line bg-surface px-4 py-1.5 text-sm text-ink-light hover:border-accent hover:bg-accent-light hover:text-accent transition-all cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>
      </motion.div>

      {/* 3. Core Overview Metrics (Vibrant & Card-Centric) */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid gap-6 sm:grid-cols-3"
      >
        {/* Metric 1: Documents */}
        <motion.div variants={itemVariants} className="card-hover rounded-2xl border border-line bg-surface p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-muted">
              Authorized Docs
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 text-blue-600 shadow-inner">
              <FileText className="h-5 w-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-extrabold text-ink font-[tabular-nums]">
              {stats?.accessible_documents ?? 0}
              <span className="text-sm font-semibold text-muted ml-2">
                / {stats?.total_documents ?? 0} total
              </span>
            </div>
            <p className="text-sm text-muted mt-2">Available for AI search</p>
          </div>
        </motion.div>

        {/* Metric 2: Queries */}
        <motion.div variants={itemVariants} className="card-hover rounded-2xl border border-line bg-surface p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-muted">
              Queries Answered
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 text-violet-600 shadow-inner">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-extrabold text-ink font-[tabular-nums]">
              {stats?.my_queries ?? 0}
            </div>
            <p className="text-sm text-muted mt-2">Grounded with page citations</p>
          </div>
        </motion.div>

        {/* Metric 3: Security */}
        <motion.div variants={itemVariants} className="card-hover rounded-2xl border border-line bg-surface p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-muted">
              Security Shield
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600 shadow-inner">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3 text-3xl sm:text-4xl font-extrabold text-ink">
              <span>Protected</span>
              <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            </div>
            <p className="text-sm text-muted mt-2">Zero-trust role isolation</p>
          </div>
        </motion.div>
      </motion.div>

      {/* 4. Quick Actions Cards */}
      <div className="space-y-4 pt-4">
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted">
          Quick Actions
        </h3>
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-4 sm:grid-cols-3"
        >
          {canUpload && (
            <motion.div variants={itemVariants}>
              <Link
                to="/app/documents"
                className="flex items-center gap-4 rounded-xl border border-line bg-surface p-5 hover:border-accent hover:shadow-md transition-all group relative overflow-hidden border-l-4 border-l-blue-500"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 text-surface shrink-0 group-hover:scale-110 transition-transform shadow-sm relative z-10">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="min-w-0 relative z-10">
                  <p className="text-base font-bold text-ink group-hover:text-blue-700 transition-colors truncate">
                    Upload Documents
                  </p>
                  <p className="text-sm text-muted truncate">
                    Add PDFs or Database Records
                  </p>
                </div>
              </Link>
            </motion.div>
          )}

          {canManageRoles && (
            <motion.div variants={itemVariants}>
              <Link
                to="/app/roles-hub"
                className="flex items-center gap-4 rounded-xl border border-line bg-surface p-5 hover:border-accent hover:shadow-md transition-all group relative overflow-hidden border-l-4 border-l-indigo-500"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-indigo-500 text-surface shrink-0 group-hover:scale-110 transition-transform shadow-sm relative z-10">
                  <Globe className="h-6 w-6" />
                </div>
                <div className="min-w-0 relative z-10">
                  <p className="text-base font-bold text-ink group-hover:text-accent transition-colors truncate">
                    Role Portals
                  </p>
                  <p className="text-sm text-muted truncate">
                    Manage shareable login URLs
                  </p>
                </div>
              </Link>
            </motion.div>
          )}

          <motion.div variants={itemVariants}>
            <Link
              to="/app/access-requests"
              className="flex items-center gap-4 rounded-xl border border-line bg-surface p-5 hover:border-accent hover:shadow-md transition-all group relative overflow-hidden border-l-4 border-l-amber-500"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-amber-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-400 text-surface shrink-0 group-hover:scale-110 transition-transform shadow-sm relative z-10">
                <KeyRound className="h-6 w-6" />
              </div>
              <div className="min-w-0 relative z-10">
                <p className="text-base font-bold text-ink group-hover:text-amber-600 transition-colors truncate">
                  Access Requests
                </p>
                <p className="text-sm text-muted truncate">
                  {stats?.pending_requests_count ? `${stats.pending_requests_count} pending review` : "Review clearances"}
                </p>
              </div>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
