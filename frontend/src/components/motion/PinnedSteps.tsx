import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  ShieldCheck,
  Database,
  FileCheck,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Lock,
  Search,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Layers,
} from "lucide-react";
import { prefersReducedMotion } from "../../lib/motion";

interface Step {
  id: number;
  title: string;
  subtitle: string;
  desc: string;
  icon: typeof MessageSquare;
  technicalHeading: string;
  technicalCode: string;
  guarantee: string;
  metric: string;
}

const STEPS: Step[] = [
  {
    id: 1,
    title: "1. You ask a question",
    subtitle: "Identity Context & Signed Roles",
    desc: "Your query is received with your cryptographically signed JWT token, assigned organizational roles, and clearance tier.",
    icon: MessageSquare,
    technicalHeading: "Request Boundary Authentication",
    technicalCode: `POST /api/chat/query
Headers: {
  Authorization: "Bearer <signed_jwt_token>",
  Actor: "Asha (Admin)",
  Clearance: "L1 (Internal)",
  Roles: ["admin", "employee"]
}`,
    guarantee: "Zero plain-text bypass: Identity is verified on server before any retrieval logic is invoked.",
    metric: "Cryptographic Identity Verified",
  },
  {
    id: 2,
    title: "2. Access check runs before AI",
    subtitle: "SQL Pre-Retrieval Authorization Barrier",
    desc: "A SQL security barrier filters the database so unauthorized documents are discarded before the AI engine ever sees them.",
    icon: ShieldCheck,
    technicalHeading: "SQL Pre-Retrieval ACL Clause",
    technicalCode: `SELECT chunks.id, chunks.text, chunks.embedding
FROM chunks
JOIN documents ON chunks.document_id = documents.id
WHERE documents.tenant_id = :tenant_id
  AND documents.classification <= :user_clearance
  AND (documents.is_public = TRUE OR :user_id IN (grants))`,
    guarantee: "Deterministic isolation: Unauthorized document vectors never enter the model context window.",
    metric: "100% Pre-Retrieval Enforcement",
  },
  {
    id: 3,
    title: "3. Search only allowed documents",
    subtitle: "Isolated Vector Cosine Similarity",
    desc: "High-dimensional vector embedding search queries passages only within your strictly authorized document boundary.",
    icon: Database,
    technicalHeading: "Authorized Vector Search",
    technicalCode: `Cosine Similarity Match:
1. Embed Query -> vector[1536]
2. Filter Candidates -> Authorized Boundary Only
3. Rank Top K Passages -> [Doc #1 (0.892), Doc #2 (0.841)]
4. Exclude 0% of unauthorized files from search space`,
    guarantee: "No data leakage: Vector space is partitioned by tenant and clearance boundaries.",
    metric: "Zero Cross-Tenant Leakage",
  },
  {
    id: 4,
    title: "4. Answer with exact page sources",
    subtitle: "Strict Evidence Grounding & Page Inspector",
    desc: "Every answer provides verified citations linked directly to high-resolution scans of the original document pages.",
    icon: FileCheck,
    technicalHeading: "Strict Evidence Grounding & Verification",
    technicalCode: `Generated Answer:
"Full-time employees receive 24 days of paid annual leave."
Citations: [
  { id: "chunk_49", document: "Leave Policy", page: 1, verified: true }
]
Policy: Answers without verified citations are automatically abstained.`,
    guarantee: "Audit-ready grounding: Every claim is backed by an inspectable optical page scan.",
    metric: "100% Source Traceability",
  },
];

export function PinnedSteps() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const isReduced = prefersReducedMotion();

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying || isReduced) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % STEPS.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPlaying, isReduced]);

  const current = STEPS[activeStep];
  const Icon = current.icon;

  return (
    <section
      aria-labelledby="zero-trust-title"
      className="my-8 rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-sm transition-all"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5 text-[0.7rem] font-mono font-semibold uppercase tracking-wider text-accent">
              <Lock className="h-3 w-3" />
              Security Architecture
            </span>
            <span className="text-xs text-muted font-mono">• End-to-End Zero-Trust</span>
          </div>
          <h2 id="zero-trust-title" className="display text-2xl sm:text-3xl font-semibold text-ink mt-1.5">
            How your answer is protected
          </h2>
          <p className="text-xs sm:text-sm text-muted mt-0.5">
            Access checks run at the SQL layer before the AI sees any document context.
          </p>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              isPlaying
                ? "border-accent bg-accent/10 text-accent"
                : "border-line bg-surface-subtle text-muted hover:text-ink"
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5" />
                <span>Pause Tour</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                <span>Auto-play Flow</span>
              </>
            )}
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveStep((p) => (p === 0 ? STEPS.length - 1 : p - 1))}
              className="rounded-lg border border-line p-1.5 text-muted hover:bg-surface-hover hover:text-ink transition-colors"
              aria-label="Previous step"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveStep((p) => (p + 1) % STEPS.length)}
              className="rounded-lg border border-line p-1.5 text-muted hover:bg-surface-hover hover:text-ink transition-colors"
              aria-label="Next step"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Step Navigation Bar */}
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((step, idx) => {
          const StepIcon = step.icon;
          const isActive = idx === activeStep;
          const isCompleted = idx < activeStep;

          return (
            <button
              key={step.id}
              onClick={() => {
                setActiveStep(idx);
                setIsPlaying(false);
              }}
              className={`relative flex items-center gap-3 rounded-xl p-3 text-left transition-all duration-200 ${
                isActive
                  ? "bg-surface-subtle border-2 border-ink shadow-xs"
                  : "border border-line hover:border-ink/40 bg-white/40"
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  isActive
                    ? "bg-ink text-white"
                    : isCompleted
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-line/70 text-muted"
                }`}
              >
                <StepIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[0.65rem] uppercase tracking-wider font-mono font-semibold text-muted">
                  Stage {step.id}
                </p>
                <p className={`text-xs font-semibold truncate ${isActive ? "text-ink" : "text-muted"}`}>
                  {step.subtitle}
                </p>
              </div>

              {isActive && (
                <motion.div
                  layoutId="active-indicator"
                  className="absolute -bottom-1 left-4 right-4 h-0.5 bg-ink rounded-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Main Interactive Stage Display */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr] items-stretch">
        {/* Left: Stage Overview & Guarantees */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col justify-between rounded-xl border border-line bg-page p-6 space-y-6"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-surface border border-line px-3 py-1 font-mono text-xs font-semibold text-ink">
                  Pipeline Stage {current.id} of 4
                </span>
                <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {current.metric}
                </span>
              </div>

              <div>
                <h3 className="display text-2xl sm:text-3xl font-semibold text-ink">
                  {current.title}
                </h3>
                <p className="mt-2 text-sm text-ink leading-relaxed font-sans">
                  {current.desc}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-surface p-4 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span>Zero-Trust Assurance</span>
              </div>
              <p className="text-xs text-muted leading-relaxed font-sans">
                {current.guarantee}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Right: Technical Inspector Code/Payload */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id + "-tech"}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col justify-between rounded-xl border border-ink/80 bg-ink p-5 text-surface text-xs font-mono shadow-md"
          >
            <div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-white/80 font-semibold text-xs tracking-wide">
                    {current.technicalHeading}
                  </span>
                </div>
                <span className="text-white/40 text-[0.7rem]">LIVE TELEMETRY</span>
              </div>

              <pre className="overflow-x-auto text-emerald-300 text-xs leading-relaxed whitespace-pre-wrap py-2">
                {current.technicalCode}
              </pre>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-white/50 text-[0.7rem]">
              <span>SQL ACL Enforcement: Active</span>
              <span className="text-white/80">Aegis Core v2</span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
