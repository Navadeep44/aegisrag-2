import { motion } from "framer-motion";
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Lock,
  XCircle,
  ShieldCheck,
  Sparkles,
  Database,
  FileText,
  ChevronRight,
} from "lucide-react";
import { LogoMark } from "../../components/brand/Logo";

const SheetStack = lazy(() => import("../../components/three/SheetStack"));

function DocumentScene() {
  return (
    <div className="relative h-[24rem] w-full sm:h-[30rem] lg:h-[36rem]">
      {/* Background Ambient Glows */}
      <div className="pointer-events-none absolute -inset-4 rounded-[2.5rem] bg-gradient-to-tr from-accent/20 via-transparent to-ai/20 blur-2xl opacity-70" />
      <div className="grid-bg absolute -inset-6 opacity-60" />

      {/* Main 3D Canvas Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="glass-premium absolute inset-0 overflow-hidden rounded-[2.5rem] border border-line/80 shadow-xl"
      >
        <Suspense fallback={
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        }>
          <SheetStack />
        </Suspense>
      </motion.div>

      {/* Floating Permission Pill: Authorized */}
      <motion.div
        initial={{ opacity: 0, y: 14, x: -10 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ delay: 0.85, duration: 0.5, ease: "easeOut" }}
        className="glass-premium absolute left-4 top-5 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-ink shadow-md"
      >
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-allow/15 text-allow">
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <div>
          <span className="block text-ink">Authorized Sources</span>
          <span className="text-[10px] font-medium text-muted">Lift into cited answer</span>
        </div>
      </motion.div>

      {/* Floating Permission Pill: Restricted */}
      <motion.div
        initial={{ opacity: 0, y: 14, x: 10 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ delay: 1.05, duration: 0.5, ease: "easeOut" }}
        className="glass-premium absolute bottom-6 right-4 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-ink shadow-md"
      >
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-deny/15 text-deny">
          <XCircle className="h-4 w-4" />
        </span>
        <div>
          <span className="block text-ink">Restricted Documents</span>
          <span className="text-[10px] font-medium text-muted">Pre-filtered in database SQL</span>
        </div>
      </motion.div>

      {/* Floating Brand Emblem */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.25, type: "spring", stiffness: 200, damping: 15 }}
        className="glass-premium absolute bottom-6 left-4 flex items-center gap-3 rounded-2xl border border-accent/40 p-2.5 pr-4 shadow-lg"
      >
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-accent/20 to-ai/20 shadow-xs">
          <LogoMark className="h-7 w-7" />
        </div>
        <div className="hidden sm:block">
          <p className="text-xs font-bold text-ink">Eyes Only gate</p>
          <p className="font-mono text-[10px] text-accent font-semibold">Active & Enforcing</p>
        </div>
      </motion.div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-6 pb-16 lg:pt-12 lg:pb-24">
      {/* Background Subtle Gradient Accents */}
      <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-20 h-96 w-96 rounded-full bg-ai/10 blur-3xl" />

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.1fr_1.1fr] lg:gap-16">
        <div>
          {/* Eyebrow Pill */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-light/80 px-3.5 py-1.5 text-xs font-bold text-accent shadow-2xs backdrop-blur-md"
          >
            <span className="flex h-2 w-2 rounded-full bg-accent animate-ping" />
            <Lock className="h-3.5 w-3.5" />
            <span>Enterprise Multi-Modal RAG with SQL-Level RBAC</span>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="display text-4xl leading-[1.04] text-ink sm:text-6xl lg:text-7xl"
          >
            Answers only from <br />
            <span className="text-gradient">what you're cleared</span> <br />
            to see.
          </motion.h1>

          {/* Value Proposition */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="mt-6 max-w-lg text-base leading-relaxed text-muted sm:text-lg"
          >
            PDFs, scans, photos, spreadsheets, and database rows — permission-verified
            directly inside SQL queries. Every claim cited, zero hallucinations, zero prompt injection leaks.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="mt-8 flex flex-wrap items-center gap-3.5"
          >
            <Link
              to="/signin"
              className="btn-primary inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Explore Personas Demo</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#pipeline"
              className="inline-flex items-center gap-2 rounded-2xl border border-line bg-surface/90 px-6 py-3.5 text-sm font-bold text-ink shadow-xs transition-all hover:border-accent/50 hover:bg-surface-hover/80 active:scale-[0.98]"
            >
              <span>View Processing Pipeline</span>
              <ChevronRight className="h-4 w-4 text-muted" />
            </a>
          </motion.div>

          {/* Metrics Strip */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.32 }}
            className="mt-12 grid max-w-md grid-cols-3 gap-4 border-t border-line/70 pt-8"
          >
            {[
              ["0 Chunks", "Restricted data sent to AI model"],
              ["100%", "Claims backed by verifiable citations"],
              ["4 Formats", "PDFs, scans, photos & databases"],
            ].map(([val, desc]) => (
              <div key={desc} className="space-y-1">
                <p className="display text-2xl font-bold text-ink sm:text-3xl">{val}</p>
                <p className="text-[11px] leading-tight text-muted">{desc}</p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Right 3D Visualizer Scene */}
        <DocumentScene />
      </div>
    </section>
  );
}
