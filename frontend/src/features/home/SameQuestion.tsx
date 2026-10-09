import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator,
  CheckCircle2,
  SearchX,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  User,
  Sparkles,
  ArrowRight,
} from "lucide-react";

interface PersonaData {
  id: string;
  name: string;
  role: string;
  level: string;
  clearanceCode: number;
  dept: string;
  avatarRing: string;
  queries: {
    q: string;
    status: "allowed" | "computed" | "withheld";
    headline: string;
    sourceCited: string;
    sqlFilter: string;
  }[];
}

const PERSONAS: PersonaData[] = [
  {
    id: "emil",
    name: "Emil",
    role: "General Employee",
    level: "L1 Internal",
    clearanceCode: 1,
    dept: "General",
    avatarRing: "from-blue-500 to-sky-400",
    queries: [
      {
        q: "What was our total annual revenue?",
        status: "withheld",
        headline: "No authorized source",
        sourceCited: "Revenue Report (L2) filtered out before retrieval",
        sqlFilter: "WHERE classification <= 1 AND (tenant_id = 'acme')",
      },
      {
        q: "Total approved expense claims?",
        status: "computed",
        headline: "$145.20",
        sourceCited: "1 row · General department rows only",
        sqlFilter: "WHERE (Department = 'General' OR full_access = true)",
      },
      {
        q: "Executive salary bands for 2026?",
        status: "withheld",
        headline: "No authorized source",
        sourceCited: "Salary Bands (L3) requires HR / Owner clearance",
        sqlFilter: "WHERE classification <= 1 (L3 strictly withheld)",
      },
    ],
  },
  {
    id: "farid",
    name: "Farid",
    role: "Finance Specialist",
    level: "L2 Confidential",
    clearanceCode: 2,
    dept: "Finance",
    avatarRing: "from-amber-500 to-orange-400",
    queries: [
      {
        q: "What was our total annual revenue?",
        status: "allowed",
        headline: "$48.2 Million",
        sourceCited: "FY2025 Revenue Report, Page 1",
        sqlFilter: "WHERE classification <= 2 AND role IN ('finance', 'exec')",
      },
      {
        q: "Total approved expense claims?",
        status: "computed",
        headline: "$34,266.45",
        sourceCited: "12 rows aggregated across all departments",
        sqlFilter: "WHERE role = 'finance' (Full cross-dept row access)",
      },
      {
        q: "Executive salary bands for 2026?",
        status: "withheld",
        headline: "No authorized source",
        sourceCited: "Salary Bands (L3) restricted to HR Department",
        sqlFilter: "WHERE role IN ('hr') (Finance role lacks clearance)",
      },
    ],
  },
  {
    id: "hema",
    name: "Hema",
    role: "HR Director",
    level: "L3 Restricted",
    clearanceCode: 3,
    dept: "HR",
    avatarRing: "from-rose-500 to-red-400",
    queries: [
      {
        q: "What was our total annual revenue?",
        status: "withheld",
        headline: "No authorized source",
        sourceCited: "Revenue Report restricted to Finance & Executive roles",
        sqlFilter: "WHERE role IN ('finance', 'executive')",
      },
      {
        q: "Total approved expense claims?",
        status: "computed",
        headline: "$1,840.00",
        sourceCited: "3 rows · HR department claims only",
        sqlFilter: "WHERE Department = 'HR'",
      },
      {
        q: "Executive salary bands for 2026?",
        status: "allowed",
        headline: "Band E-1: $210K – $280K",
        sourceCited: "Salary Bands 2026.xlsx, Sheet 1",
        sqlFilter: "WHERE classification <= 3 AND role = 'hr'",
      },
    ],
  },
];

const STATUS_TONES = {
  allowed: {
    badge: "border-allow/30 bg-allow/10 text-allow",
    icon: ShieldCheck,
    title: "Authorized & Cited",
  },
  computed: {
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
    icon: Calculator,
    title: "Exact Deterministic Math",
  },
  withheld: {
    badge: "border-warn/30 bg-warn/10 text-warn",
    icon: SearchX,
    title: "Zero-Leakage Withheld",
  },
};

export function SameQuestion() {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("farid");
  const selectedPersona =
    PERSONAS.find((p) => p.id === selectedPersonaId) || PERSONAS[1];

  return (
    <section id="same-question" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <div className="mb-12 text-center">
        <span className="chip mb-3 border-accent/30 bg-accent-light text-accent">
          <ShieldCheck className="h-3.5 w-3.5" /> Granular Access Control
        </span>
        <h2 className="display text-3xl text-ink sm:text-4xl lg:text-5xl">
          Same question. <span className="text-gradient">Different truth.</span>
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-base text-muted">
          Enterprise answers depend strictly on who is asking. Select a persona below to inspect
          how the retrieval SQL and synthesized answers adapt in real time.
        </p>
      </div>

      {/* Interactive Persona Tabs */}
      <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
        {PERSONAS.map((p) => {
          const isActive = p.id === selectedPersonaId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPersonaId(p.id)}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-300 ${
                isActive
                  ? "glass-premium border-accent/60 shadow-md scale-105"
                  : "border-line bg-surface/70 hover:border-accent/40 hover:bg-surface-hover/70"
              }`}
            >
              <span
                className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br p-[2px] ${p.avatarRing}`}
              >
                <span className="display grid h-full w-full place-items-center rounded-[10px] bg-surface text-sm font-bold text-ink">
                  {p.name[0]}
                </span>
              </span>
              <div>
                <p className="display text-sm font-bold text-ink">{p.name}</p>
                <p className="text-[11px] text-muted">
                  {p.role} · <span className="font-semibold text-accent">{p.level}</span>
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Persona Query Results Grid */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedPersona.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.3 }}
          className="glass-premium rounded-3xl border border-line/80 p-6 sm:p-10 shadow-xl"
        >
          {/* Header Bar */}
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-line/70 pb-6">
            <div className="flex items-center gap-3.5">
              <span
                className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br p-[2px] ${selectedPersona.avatarRing}`}
              >
                <span className="display grid h-full w-full place-items-center rounded-[14px] bg-surface text-lg font-bold text-ink">
                  {selectedPersona.name[0]}
                </span>
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="display text-xl font-bold text-ink">
                    {selectedPersona.name}'s Search Scope
                  </h3>
                  <span className="chip border-line bg-surface text-[10px] font-bold text-accent">
                    {selectedPersona.dept} Department
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Clearance Level {selectedPersona.clearanceCode} • Role-based & Row-level filtering enforced
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted">Retrieved via:</span>
              <span className="chip border-accent/30 bg-accent-light font-mono text-xs font-bold text-accent">
                FastAPI + SQLite FTS5 + Gemini Vectors
              </span>
            </div>
          </div>

          {/* 3 Queries Side by Side or Vertical List */}
          <div className="grid gap-5 md:grid-cols-3">
            {selectedPersona.queries.map((q, idx) => {
              const tone = STATUS_TONES[q.status];
              const Icon = tone.icon;
              return (
                <div
                  key={q.q}
                  className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-xs transition-all hover:border-accent/40"
                >
                  <div>
                    {/* Status Badge */}
                    <div className="mb-3 flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${tone.badge}`}>
                        <Icon className="h-3 w-3" />
                        <span>{tone.title}</span>
                      </span>
                      <span className="font-mono text-[10px] text-muted-light font-bold">
                        Query 0{idx + 1}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-muted">“{q.q}”</p>
                    <p className="display mt-3 text-2xl font-bold text-ink">{q.headline}</p>
                    <p className="mt-2 text-xs leading-relaxed text-ink-light">
                      <CheckCircle2 className="inline h-3.5 w-3.5 text-accent mr-1 shrink-0" />
                      {q.sourceCited}
                    </p>
                  </div>

                  {/* SQL Filter Preview */}
                  <div className="mt-5 rounded-xl border border-line bg-surface-subtle p-2.5 font-mono text-[10px] text-muted-light">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-muted">
                      Executed SQL Clause:
                    </span>
                    <span className="text-accent font-medium truncate block">{q.sqlFilter}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
