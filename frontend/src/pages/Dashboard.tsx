import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, ArrowUp, Ban, Cpu, Database, FileStack, KeyRound, Layers, Lock, MessageSquareText, ScanLine,
  ShieldCheck, SlidersHorizontal, Sparkles, Upload, Users, type LucideIcon,
} from "lucide-react";
import { StatCard } from "../components/ui/StatCard";
import { ClearancePill, RolePill } from "../components/ui/StatusPill";
import { Notice } from "../components/ui/Notice";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { hasPermission, LEVELS, type DashboardStats, type PipelineInfo } from "../lib/types";

const LEVEL_BAR = ["bg-level-0", "bg-level-1", "bg-level-2", "bg-level-3"];

type Action = { to: string; icon: LucideIcon; label: string; show: boolean };

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [info, setInfo] = useState<PipelineInfo | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    api<DashboardStats>("/dashboard/stats").then(setStats).catch((e) => setError((e as Error).message));
    api<PipelineInfo>("/system/pipeline").then(setInfo).catch(() => {});
  }, []);

  if (!user) return null;
  const roles = user.roles || [];
  const admin = user.is_admin || roles.includes("admin") || roles.includes("organization_owner");
  const counts = stats?.classification_counts;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  const actions: Action[] = [
    { to: "/app/ask", icon: Sparkles, label: "Ask", show: true },
    { to: "/app/documents", icon: FileStack, label: "Documents", show: true },
    { to: "/app/documents", icon: Upload, label: "Upload", show: hasPermission(user, "document.upload") },
    { to: "/app/access-requests", icon: KeyRound, label: "Access", show: true },
    { to: "/app/simulator", icon: SlidersHorizontal, label: "Simulate", show: admin || hasPermission(user, "policy.simulate") },
    { to: "/app/security", icon: ShieldCheck, label: "Security", show: admin || hasPermission(user, "audit.read") },
    { to: "/app/users-and-roles", icon: Users, label: "Team", show: admin || hasPermission(user, "user.invite") },
  ].filter((a) => a.show);

  return (
    <div className="space-y-6 pb-12">
      {/* Identity + ask */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2rem] border border-line bg-gradient-to-br from-accent-light via-surface to-ai-light p-6 shadow-sm sm:p-8">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted">{user.tenant}</p>
            <h1 className="display text-3xl text-ink sm:text-4xl">Hi, {user.name.split(" ")[0]}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ClearancePill clearance={user.clearance} label={user.clearance_label} />
              {roles.slice(0, 3).map((r) => <RolePill key={r} role={r} />)}
            </div>
          </div>
          {stats && (
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/80 px-4 py-3">
              <Lock className="h-8 w-8 text-accent" strokeWidth={1.6} />
              <div>
                <p className="display text-2xl text-ink">{stats.accessible_documents ?? 0}<span className="text-sm text-muted"> / {stats.total_documents ?? 0}</span></p>
                <p className="text-[11px] text-muted">documents in your scope</p>
              </div>
            </div>
          )}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/app/ask?q=${encodeURIComponent(q.trim())}`); }}
          className="relative mt-6 flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm focus-within:border-accent/50">
          <Sparkles className="ml-2 h-5 w-5 text-ai" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about anything you're cleared to see…"
            className="flex-1 bg-transparent px-2 py-2.5 text-sm text-ink placeholder:text-muted-light focus:outline-none" />
          <button className="btn-primary grid h-10 w-10 place-items-center rounded-xl" aria-label="Ask"><ArrowUp className="h-5 w-5" /></button>
        </form>
      </motion.section>

      {error && <Notice tone="error">{error}</Notice>}

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {actions.map((a, i) => {
          const Icon = a.icon;
          return (
            <motion.div key={a.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}>
              <Link to={a.to} className="glass glass-hover group flex flex-col items-center gap-2 rounded-2xl p-4">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent-light text-accent transition-colors group-hover:bg-accent group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold text-ink">{a.label}</span>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={MessageSquareText} label="My questions" value={stats?.my_queries ?? 0} tone="sky" />
        <StatCard icon={Layers} label="Org questions" value={stats?.total_queries ?? 0} tone="violet" />
        <StatCard icon={KeyRound} label="Pending requests" value={stats?.pending_requests_count ?? 0} tone="amber" />
        <StatCard icon={Ban} label="Denials · 24h" value={stats?.denials_24h ?? 0} tone="rose" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Classification stamps */}
        <section className="glass rounded-2xl p-5">
          <p className="mb-4 flex items-center gap-2 text-sm font-bold text-ink"><Lock className="h-4 w-4 text-accent" /> Classification mix</p>
          {counts && total > 0 ? (
            <>
              <div className="flex h-4 overflow-hidden rounded-full">
                {Object.values(counts).map((n, i) => n > 0 && (
                  <motion.div key={i} initial={{ width: 0 }} animate={{ width: `${(n / total) * 100}%` }} transition={{ duration: 0.8, delay: i * 0.1 }}
                    className={LEVEL_BAR[i]} />
                ))}
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {Object.values(counts).map((n, i) => (
                  <div key={i} className="rounded-xl border border-line bg-surface-subtle p-2.5 text-center">
                    <span className={`mx-auto mb-1 block h-2 w-2 rounded-full ${LEVEL_BAR[i]}`} />
                    <p className="display text-xl text-ink">{n}</p>
                    <p className="text-[10px] text-muted">{LEVELS[i]}</p>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="skeleton h-24 rounded-xl" />}
        </section>

        {/* Engine */}
        <section className="glass rounded-2xl p-5">
          <p className="mb-4 flex items-center gap-2 text-sm font-bold text-ink"><Cpu className="h-4 w-4 text-ai" /> Engine</p>
          {info ? (
            <div className="grid grid-cols-2 gap-2">
              {[
                [Sparkles, "Model", info.chat_model],
                [Database, "Vectors", `${info.embed_dim}-d · ${info.embed_model}`],
                [ScanLine, "OCR", info.ocr.join(" + ") || "off"],
                [Lock, "Row rules", `${info.row_rules} guarded chunks`],
                [FileStack, "Indexed", `${info.chunks} chunks`],
                [Layers, "Records", `${info.records} rows`],
              ].map(([Icon, k, v]) => {
                const I = Icon as LucideIcon;
                return (
                  <div key={k as string} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-subtle p-2.5">
                    <I className="h-4 w-4 shrink-0 text-accent" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{k as string}</p>
                      <p className="truncate text-xs font-semibold text-ink">{v as string}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <div className="skeleton h-24 rounded-xl" />}
          <Link to="/app/ask" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline">
            Try it <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      </div>
    </div>
  );
}
