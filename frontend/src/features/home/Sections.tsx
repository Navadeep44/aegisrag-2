import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowRight, Calculator, Database, FileSearch, FileSpreadsheet, FileText, Fingerprint, Image as ImageIcon, Lock,
  ScanLine, Search, ShieldCheck, Sparkles, type LucideIcon,
} from "lucide-react";

const STEPS: { icon: LucideIcon; t: string; d: string }[] = [
  { icon: Fingerprint, t: "Identity", d: "Signed token → roles, clearance, dept" },
  { icon: Lock, t: "SQL ACL", d: "Doc + row rules inside the query" },
  { icon: Search, t: "Hybrid search", d: "Gemini vectors + BM25, RRF" },
  { icon: Calculator, t: "Compute", d: "Exact math over allowed rows" },
  { icon: Sparkles, t: "Generate", d: "Evidence-only, JSON schema" },
  { icon: ShieldCheck, t: "Verify", d: "Each claim vs. its cited text" },
];

export function PipelineStrip() {
  return (
    <section id="pipeline" className="border-y border-line bg-surface/60 py-16">
      <div className="mx-auto max-w-7xl px-5">
        <h2 className="display mb-10 text-center text-3xl text-ink sm:text-4xl">Six gates between a question and an answer</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div key={s.t} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.07 }} className="glass relative rounded-2xl p-4">
                <span className="absolute right-3 top-3 font-mono text-[10px] text-muted-light">0{i + 1}</span>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-white shadow-md"><Icon className="h-5 w-5" /></span>
                <p className="display mt-3 text-base text-ink">{s.t}</p>
                <p className="mt-0.5 text-xs text-muted">{s.d}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const MODES: { icon: LucideIcon; t: string; chips: string[]; tint: string }[] = [
  { icon: FileText, t: "PDFs", chips: ["headings", "tables", "charts"], tint: "from-rose-500/15 text-rose-700" },
  { icon: ScanLine, t: "Scans", chips: ["Gemini vision", "RapidOCR offline"], tint: "from-amber-500/15 text-amber-700" },
  { icon: ImageIcon, t: "Photos", chips: ["whiteboards", "notices", "receipts"], tint: "from-violet-500/15 text-violet-700" },
  { icon: Database, t: "DB records", chips: ["row-level ACL", "exact SUM/AVG"], tint: "from-emerald-500/15 text-emerald-700" },
  { icon: FileSpreadsheet, t: "Spreadsheets", chips: ["per-row chunks", "column-aware"], tint: "from-teal-500/15 text-teal-700" },
  { icon: FileSearch, t: "Word & text", chips: ["sections", "tables"], tint: "from-sky-500/15 text-sky-700" },
];

export function Modalities() {
  return (
    <section id="modalities" className="mx-auto max-w-7xl px-5 py-20">
      <h2 className="display mb-10 text-center text-3xl text-ink sm:text-4xl">One index. <span className="text-gradient">Every format.</span></h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODES.map((m, i) => {
          const Icon = m.icon;
          return (
            <motion.div key={m.t} initial={{ opacity: 0, scale: 0.96 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}
              transition={{ delay: i * 0.05 }} className={`glass glass-hover rounded-3xl bg-gradient-to-br ${m.tint.split(" ")[0]} to-transparent p-5`}>
              <Icon className={`h-9 w-9 ${m.tint.split(" ")[1]}`} strokeWidth={1.6} />
              <p className="display mt-4 text-xl text-ink">{m.t}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">{m.chips.map((c) => <span key={c} className="chip">{c}</span>)}</div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

const PROOF = [
  { v: "SQL", l: "Permission filter is part of every retrieval statement" },
  { v: "Row", l: "Records carry their own grants via chunk_access" },
  { v: "Claim", l: "Numbers and wording checked against the cited chunk" },
  { v: "Live", l: "Revoking access withdraws old answers" },
];

export function Proof() {
  return (
    <section id="proof" className="mx-auto max-w-7xl px-5 pb-24">
      <div className="relative overflow-hidden rounded-[2rem] bg-ink p-8 text-surface sm:p-12">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-accent/40 blur-3xl" />
        <div className="absolute -bottom-24 left-10 h-64 w-64 rounded-full bg-ai/30 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <h2 className="display text-3xl text-white sm:text-4xl">Don't trust it. <br />Run the attacks.</h2>
            <p className="mt-3 text-sm text-white/70">Cross-tenant probes, forged roles, prompt injection, revoked access — tested live from the console.</p>
            <Link to="/signin" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-ink hover:bg-accent-light">
              Open the console <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {PROOF.map((p) => (
              <div key={p.v} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="display text-2xl text-white">{p.v}</p>
                <p className="mt-1 text-xs text-white/70">{p.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
