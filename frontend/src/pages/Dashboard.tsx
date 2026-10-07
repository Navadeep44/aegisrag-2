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
    <div className="space-y-6 pb-12 max-w-6xl mx-auto">
      {/* 1. Header & Identity Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Hello, {firstName}
            </h1>
            <ClearancePill clearance={user.clearance} label={user.clearance_label} />
            {roles.slice(0, 1).map((r) => (
              <RolePill key={r} role={r} />
            ))}
          </div>
          <p className="text-xs text-slate-500 font-medium">
            {user.tenant || "Enterprise Workspace"}
          </p>
        </div>

        <Link to="/app/ask">
          <Button kind="primary" className="flex items-center gap-2 shadow-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer">
            <Sparkles className="h-4 w-4" />
            <span>Ask AI</span>
          </Button>
        </Link>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {/* 2. Hero Search Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Ask Your Knowledge Base
            </h2>
            <p className="text-xs text-slate-500">
              Instant answers grounded in your authorized documents
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[0.7rem] font-semibold text-indigo-700">
            <Sparkles className="h-3 w-3" />
            AI Retrieval
          </span>
        </div>

        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="relative flex items-center">
            <Search className="absolute left-4 h-4.5 w-4.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ask a question... e.g. What is our leave policy?"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-11 pr-24 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!searchQuery.trim()}
              className="absolute right-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-opacity hover:bg-indigo-700 disabled:opacity-40 cursor-pointer"
            >
              Ask
            </button>
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="text-[0.72rem] text-slate-400 font-medium">Try asking:</span>
          {starterPrompts.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => navigate(`/app/ask?q=${encodeURIComponent(prompt)}`)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-900 transition-colors cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>
      </motion.div>

      {/* 3. Core Overview Metrics (Vibrant & Card-Centric) */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Metric 1: Documents */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3 hover:border-blue-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Authorized Docs
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {stats?.accessible_documents ?? 0}
              <span className="text-xs font-normal text-slate-400 ml-1.5">
                / {stats?.total_documents ?? 0} total
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Available for AI search</p>
          </div>
        </div>

        {/* Metric 2: Queries */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3 hover:border-violet-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Queries Answered
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {stats?.my_queries ?? 0}
            </div>
            <p className="text-xs text-slate-500 mt-1">Grounded with page citations</p>
          </div>
        </div>

        {/* Metric 3: Security */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3 hover:border-emerald-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Security Shield
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-2xl sm:text-3xl font-extrabold text-slate-900">
              <span>Protected</span>
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-xs text-slate-500 mt-1">Zero-trust role isolation</p>
          </div>
        </div>
      </div>

      {/* 4. Quick Actions Cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Quick Actions
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {canUpload && (
            <Link
              to="/app/documents"
              className="flex items-center gap-3.5 rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-indigo-400 hover:shadow-sm transition-all group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shrink-0 group-hover:scale-105 transition-transform">
                <Upload className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 truncate">
                  Upload Documents
                </p>
                <p className="text-xs text-slate-500 truncate">
                  Add PDFs or Database Records
                </p>
              </div>
            </Link>
          )}

          {canManageRoles && (
            <Link
              to="/app/roles-hub"
              className="flex items-center gap-3.5 rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-indigo-400 hover:shadow-sm transition-all group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shrink-0 group-hover:scale-105 transition-transform">
                <Globe className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 truncate">
                  Role Portals
                </p>
                <p className="text-xs text-slate-500 truncate">
                  Manage shareable login URLs
                </p>
              </div>
            </Link>
          )}

          <Link
            to="/app/access-requests"
            className="flex items-center gap-3.5 rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-indigo-400 hover:shadow-sm transition-all group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shrink-0 group-hover:scale-105 transition-transform">
              <KeyRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 truncate">
                Access Requests
              </p>
              <p className="text-xs text-slate-500 truncate">
                {stats?.pending_requests_count ? `${stats.pending_requests_count} pending review` : "Review clearances"}
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
