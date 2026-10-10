import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Database,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { DocumentWorkflowExplainer } from "../documents/DocumentWorkflowExplainer";

export function PipelineStrip() {
  return (
    <section id="pipeline" className="border-y border-line/80 bg-surface/40 py-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <DocumentWorkflowExplainer />
      </div>
    </section>
  );
}

const MODES = [
  {
    icon: FileText,
    t: "Searchable PDFs & Manuals",
    chips: ["Vector Text", "Hierarchical Headings", "Table Grid Alignment"],
    tint: "from-rose-500/15 text-rose-700",
    border: "border-rose-500/30",
    example: "Clinical protocols, leave policies, architecture diagrams, compliance specs.",
  },
  {
    icon: ScanLine,
    t: "Scanned Documents & Receipts",
    chips: ["Gemini Vision OCR", "RapidOCR Offline", "Skew Correction"],
    tint: "from-amber-500/15 text-amber-700",
    border: "border-amber-500/30",
    example: "Scanned vendor invoices, paper consent forms, hospital admittance logs.",
  },
  {
    icon: ImageIcon,
    t: "Photos & Whiteboards",
    chips: ["Handwriting Recognition", "Layout Extraction", "Visual OCR"],
    tint: "from-violet-500/15 text-violet-700",
    border: "border-violet-500/30",
    example: "Engineering whiteboard roadmaps, physical security notices, lobby visitor logs.",
  },
  {
    icon: Database,
    t: "Relational & Structured DBs",
    chips: ["Row-Level Security", "Deterministic Math", "Schema Ingestion"],
    tint: "from-emerald-500/15 text-emerald-700",
    border: "border-emerald-500/30",
    example: "Dental patient registers, doctor payroll schedules, appointment queues.",
  },
  {
    icon: FileSpreadsheet,
    t: "Multi-Sheet Spreadsheets",
    chips: ["Per-Row Embeddings", "Formula Aware", "XLSX & CSV"],
    tint: "from-teal-500/15 text-teal-700",
    border: "border-teal-500/30",
    example: "Department expense claims, FY2026 salary bands, quarterly financial summaries.",
  },
  {
    icon: FileSearch,
    t: "Word & Markdown Docs",
    chips: ["Heading Outlines", "Table Conversion", "Semantic Slicing"],
    tint: "from-sky-500/15 text-sky-700",
    border: "border-sky-500/30",
    example: "Executive briefing memos, IT onboarding checklists, technical incident reviews.",
  },
];

export function Modalities() {
  return (
    <section id="modalities" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <div className="mb-12 text-center">
        <span className="chip mb-3 border-accent/30 bg-accent-light text-accent">
          <Database className="h-3.5 w-3.5" /> Multi-Modal Unification
        </span>
        <h2 className="display text-3xl text-ink sm:text-4xl lg:text-5xl">
          One unified index. <span className="text-gradient">Every format.</span>
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-base text-muted">
          No matter how your enterprise data lives, Eyes Only extracts, verifies, and indexes it
          with each tenant kept separate.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {MODES.map((m, i) => {
          const Icon = m.icon;
          return (
            <motion.div
              key={m.t}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              className={`glass-premium glass-hover relative rounded-3xl border ${m.border} p-6 sm:p-7 shadow-sm`}
            >
              <div className="flex items-center justify-between">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl border ${m.border} bg-surface ${m.tint.split(" ")[1]}`}>
                  <Icon className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <span className="font-mono text-xs font-bold text-muted-light">0{i + 1}</span>
              </div>

              <h3 className="display mt-5 text-xl font-bold text-ink">{m.t}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">{m.example}</p>

              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line/60 pt-4">
                {m.chips.map((c) => (
                  <span key={c} className="chip bg-surface text-[10px]">
                    {c}
                  </span>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

const PROOF = [
  {
    v: "SQL-Level ACL",
    l: "Authorization predicates are compiled directly into retrieval queries",
    metric: "0 Data Leakage",
  },
  {
    v: "Row Security",
    l: "Structured records enforce row policies via dynamic SQL clauses",
    metric: "Dept-Scoped",
  },
  {
    v: "Claim Citations",
    l: "Every number, date, and fact is verified against cited chunk text",
    metric: "100% Grounded",
  },
  {
    v: "Live Revocation",
    l: "Revoking access or downgrading role clearance instantly withdraws answers",
    metric: "Real-time",
  },
];

export function Proof() {
  return (
    <section id="proof" className="mx-auto max-w-7xl px-5 pb-28 sm:px-8">
      <div className="glass-dark relative overflow-hidden rounded-[2.5rem] p-8 text-white sm:p-14 shadow-2xl">
        {/* Glow Spheres */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/30 blur-3xl opacity-60" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-80 w-80 rounded-full bg-ai/25 blur-3xl opacity-50" />

        <div className="relative grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/20 px-3 py-1 text-xs font-bold text-accent">
              <ShieldCheck className="h-3.5 w-3.5" /> Adversarial Assurance
            </span>
            <h2 className="display mt-4 text-3xl font-bold text-white sm:text-5xl leading-tight">
              Don't trust it. <br />
              <span className="text-gradient">Verify live.</span>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/70 max-w-md">
              Test cross-tenant separation, role elevation attacks, prompt injection payloads,
              and live access revocations directly inside our interactive security console.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/signin"
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-bold text-ink shadow-md transition-all hover:bg-accent-light active:scale-[0.98]"
              >
                <span>Launch Security Console</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {PROOF.map((p, idx) => (
              <motion.div
                key={p.v}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md transition-all hover:bg-white/10 hover:border-accent/40"
              >
                <div className="flex items-center justify-between">
                  <p className="display text-xl font-bold text-white">{p.v}</p>
                  <span className="font-mono text-[10px] font-bold text-accent px-2 py-0.5 rounded-full bg-accent/20 border border-accent/30">
                    {p.metric}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-white/70">{p.l}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
