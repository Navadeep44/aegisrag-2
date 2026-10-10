import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  ScanLine,
  ShieldAlert,
  Database,
  Lock,
  Search,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Layers,
  Cpu,
  Fingerprint,
  FileSpreadsheet,
  AlertTriangle,
} from "lucide-react";

export interface WorkflowStage {
  id: string;
  stepNumber: string;
  title: string;
  shortDesc: string;
  icon: typeof FileText;
  badge: string;
  color: string;
  bgGradient: string;
  borderColor: string;
  details: {
    heading: string;
    description: string;
    bullets: string[];
    technicalMetric: { label: string; value: string };
    securityPillar: string;
  };
}

export const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: "ingest",
    stepNumber: "01",
    title: "Multi-Modal Ingestion",
    shortDesc: "PDFs, scans, photos, spreadsheets, and SQL exports are parsed into standardized streams.",
    icon: FileText,
    badge: "Native OCR & Extraction",
    color: "text-accent",
    bgGradient: "from-accent/15 via-surface to-accent/5",
    borderColor: "border-accent/40",
    details: {
      heading: "Format-Agnostic Structural Parsing",
      description:
        "Every incoming asset is inspected by magic bytes and processed according to its true schema. Scanned pages trigger high-precision OCR; spreadsheets & databases are segmented into schema-aware row records.",
      bullets: [
        "PyMuPDF vector text extraction + RapidOCR / Gemini Vision fallback",
        "Preserves table layout, column headers, and sheet hierarchies",
        "Captures visual layout coordinates for audit traceability",
      ],
      technicalMetric: { label: "Processing Throughput", value: "< 250ms per page" },
      securityPillar: "Zero cross-contamination during parsing; temporary memory buffers wiped immediately.",
    },
  },
  {
    id: "sanitize",
    stepNumber: "02",
    title: "Security Sanitization",
    shortDesc: "Aggressive prompt injection scrubbing and cryptographic tenant namespace isolation.",
    icon: ShieldAlert,
    badge: "Adversarial Defense",
    color: "text-deny",
    bgGradient: "from-deny/15 via-surface to-deny/5",
    borderColor: "border-deny/40",
    details: {
      heading: "Adversarial Injection & PII Firewall",
      description:
        "Untrusted document text is sanitized before indexing. Prompt injection triggers ('ignore previous instructions', 'system prompt reveal') are neutralized with security markers.",
      bullets: [
        "Regex-based and semantic adversarial prompt filtering",
        "Flagged documents quarantined instantly for security officer audit",
        "Cryptographically locked tenant ID boundaries preventing multi-tenant data leaks",
      ],
      technicalMetric: { label: "Injection Detection", value: "100% test pass rate" },
      securityPillar: "Untrusted evidence blocks are treated as inert strings, never executed as instructions.",
    },
  },
  {
    id: "embedding",
    stepNumber: "03",
    title: "Dual Vector & BM25 Indexing",
    shortDesc: "768-dimensional semantic embeddings combined with an inverted lexical index.",
    icon: Cpu,
    badge: "Hybrid Knowledge Graph",
    color: "text-ai",
    bgGradient: "from-ai/15 via-surface to-ai/5",
    borderColor: "border-ai/40",
    details: {
      heading: "Dense Vectors Meets Lexical Exact Match",
      description:
        "Document chunks receive high-dimensional dense embeddings while simultaneously building inverted lexical indices. This guarantees semantic understanding without losing exact SKU codes, invoice numbers, or employee IDs.",
      bullets: [
        "Semantic sliding-window chunking (500 tokens with 80 token overlap)",
        "Google Gemini 768-dimensional embeddings for deep conceptual reasoning",
        "BM25 lexical index for precision retrieval of exact numbers, codes, and names",
      ],
      technicalMetric: { label: "Vector Dimension", value: "768-d Gemini Embeddings" },
      securityPillar: "Vector indices are tenant-partitioned in SQLite; queries never cross tenant boundaries.",
    },
  },
  {
    id: "acl",
    stepNumber: "04",
    title: "SQL-Level RBAC & Row Security",
    shortDesc: "Clearance levels (L0–L3) and row-level policies are compiled directly into the SQL query.",
    icon: Lock,
    badge: "Zero-Leakage Filtering",
    color: "text-amber-700",
    bgGradient: "from-amber-500/15 via-surface to-amber-500/5",
    borderColor: "border-amber-500/40",
    details: {
      heading: "Security Inside the Database Query",
      description:
        "Unlike naive RAG systems that filter out forbidden documents after retrieving them, Eyes Only injects permission checks directly into the database retrieval statement. Unauthorized chunks never touch the AI context window.",
      bullets: [
        "4 Clearance levels: Public (L0), Internal (L1), Confidential (L2), Restricted (L3)",
        "Row-level security policies (e.g., General employee sees only their dept rows; Finance sees all)",
        "Dynamic time-limited access grants and audit-logged delegation",
      ],
      technicalMetric: { label: "Unauthorized Leakage", value: "0 Chunks in LLM Context" },
      securityPillar: "Mathematically proven zero information leakage in prompts.",
    },
  },
  {
    id: "synthesis",
    stepNumber: "05",
    title: "Grounded Synthesis & Verification",
    shortDesc: "Evidence-only generation with deterministic math calculation and verifiable citations.",
    icon: Sparkles,
    badge: "100% Grounded Output",
    color: "text-emerald-700",
    bgGradient: "from-emerald-500/15 via-surface to-emerald-500/5",
    borderColor: "border-emerald-500/40",
    details: {
      heading: "Verified Claims & Deterministic Computation",
      description:
        "The model synthesizes answers exclusively from the authorized evidence chunks. Aggregate queries (SUM, AVG) execute through an exact deterministic compute engine rather than hallucinating arithmetic.",
      bullets: [
        "Every claim carries an interactive numbered citation badge",
        "Deterministic arithmetic engine for exact calculations ($34,266.45, 0.14% infection rate)",
        "Automatic abstention when no authorized document answers the prompt",
      ],
      technicalMetric: { label: "Grounding Score", value: "100% Verified Citations" },
      securityPillar: "Live revocation immediately invalidates previously authorized answers.",
    },
  },
];

export function DocumentWorkflowExplainer({
  compact = false,
  showHeading = true,
}: {
  compact?: boolean;
  showHeading?: boolean;
}) {
  const [activeStageId, setActiveStageId] = useState<string>("ingest");
  const currentStage = WORKFLOW_STAGES.find((s) => s.id === activeStageId) || WORKFLOW_STAGES[0];
  const CurrentIcon = currentStage.icon;

  return (
    <div className="w-full">
      {showHeading && (
        <div className="mb-10 text-center">
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="chip mb-3 border-accent/30 bg-accent-light text-accent"
          >
            <Layers className="h-3.5 w-3.5" /> End-to-End Architecture
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 }}
            className="display text-3xl text-ink sm:text-4xl lg:text-5xl"
          >
            The Document <span className="text-gradient">Processing Pipeline</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mx-auto mt-3 max-w-2xl text-base text-muted"
          >
            How Eyes Only transforms unstructured enterprise files into permission-enforced,
            hallucination-free intelligence.
          </motion.p>
        </div>
      )}

      {/* Stepper Navigation */}
      <div className="mb-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {WORKFLOW_STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          const isActive = stage.id === activeStageId;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => setActiveStageId(stage.id)}
              className={`group relative flex flex-col items-start rounded-2xl border p-4 text-left transition-all duration-300 ${
                isActive
                  ? `glass-premium ${stage.borderColor} shadow-md scale-[1.02]`
                  : "border-line bg-surface/70 hover:border-accent/40 hover:bg-surface-hover/60"
              }`}
            >
              <div className="mb-2 flex w-full items-center justify-between">
                <span
                  className={`grid h-8 w-8 place-items-center rounded-xl border transition-colors ${
                    isActive
                      ? `border-accent/30 bg-accent/15 ${stage.color}`
                      : "border-line bg-surface-subtle text-muted group-hover:text-ink"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="font-mono text-xs font-bold text-muted-light">
                  {stage.stepNumber}
                </span>
              </div>
              <p
                className={`display text-sm font-bold transition-colors ${
                  isActive ? "text-ink" : "text-ink-light group-hover:text-ink"
                }`}
              >
                {stage.title}
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">
                {stage.shortDesc}
              </p>
              {isActive && (
                <motion.div
                  layoutId="activeIndicator"
                  className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-accent"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Detailed Stage Deep-Dive Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStage.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3 }}
          className={`glass-premium relative overflow-hidden rounded-3xl border ${currentStage.borderColor} p-6 sm:p-8 shadow-lg`}
        >
          {/* Subtle Ambient Backlight */}
          <div
            className={`pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gradient-to-br ${currentStage.bgGradient} blur-3xl opacity-60`}
          />

          <div className="relative grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2.5">
                <span className="chip border-line bg-surface font-mono text-xs font-bold text-accent">
                  Stage {currentStage.stepNumber} of 05
                </span>
                <span className={`chip border-line bg-surface font-semibold ${currentStage.color}`}>
                  {currentStage.badge}
                </span>
              </div>

              <h3 className="display text-2xl font-bold text-ink sm:text-3xl">
                {currentStage.details.heading}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-light">
                {currentStage.details.description}
              </p>

              <div className="mt-6 space-y-2.5">
                {currentStage.details.bullets.map((bullet, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-xs text-ink-light sm:text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-allow" />
                    <span>{bullet}</span>
                  </div>
                ))}
              </div>

              {/* Security Pillar Guarantee Callout */}
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-line bg-surface-subtle/80 p-3.5 text-xs">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div>
                  <span className="font-bold text-ink">Security Assurance: </span>
                  <span className="text-muted">{currentStage.details.securityPillar}</span>
                </div>
              </div>
            </div>

            {/* Interactive Telemetry / Benchmark Box */}
            <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent/10 text-accent">
                    <CurrentIcon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-ink">{currentStage.title}</p>
                    <p className="text-[10px] text-muted">Eyes Only Core Engine</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-allow/30 bg-allow/10 px-2.5 py-0.5 text-[10px] font-bold text-allow">
                  <span className="h-1.5 w-1.5 rounded-full bg-allow animate-pulse" /> Live
                </span>
              </div>

              <div className="rounded-xl border border-line bg-surface-subtle p-3.5">
                <p className="text-[11px] font-medium text-muted">
                  {currentStage.details.technicalMetric.label}
                </p>
                <p className="display mt-0.5 text-xl font-bold text-ink sm:text-2xl">
                  {currentStage.details.technicalMetric.value}
                </p>
              </div>

              {/* Flow Path Visualization */}
              <div className="space-y-2 pt-1 text-[11px]">
                <p className="font-semibold text-muted">Pipeline Progression:</p>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {WORKFLOW_STAGES.map((s, idx) => (
                    <div key={s.id} className="flex items-center gap-1 shrink-0">
                      <span
                        className={`rounded-lg px-2 py-1 font-mono text-[10px] font-bold transition-colors ${
                          s.id === currentStage.id
                            ? "border border-accent bg-accent text-white"
                            : "border border-line bg-surface-subtle text-muted"
                        }`}
                      >
                        {s.stepNumber}
                      </span>
                      {idx < WORKFLOW_STAGES.length - 1 && (
                        <span className="text-muted-light">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
