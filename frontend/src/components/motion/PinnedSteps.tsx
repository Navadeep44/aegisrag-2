import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger, prefersReducedMotion } from "../../lib/motion";
import { MessageSquare, ShieldCheck, Database, FileCheck } from "lucide-react";

interface Step {
  id: number;
  title: string;
  desc: string;
  technicalNote: string;
  icon: typeof MessageSquare;
}

const STEPS: Step[] = [
  {
    id: 1,
    title: "1. You ask a question",
    desc: "Your question is received along with your cryptographically signed identity and active roles.",
    technicalNote: "Zero plain-text bypass: Identity context is established at request boundary.",
    icon: MessageSquare,
  },
  {
    id: 2,
    title: "2. Access check runs before AI",
    desc: "A SQL-level security barrier validates which documents and clearance tiers your account can read.",
    technicalNote: "Pre-retrieval SQL ACL: Unauthorized document vectors are excluded from database scan.",
    icon: ShieldCheck,
  },
  {
    id: 3,
    title: "3. Search only allowed documents",
    desc: "The vector search only queries passages inside your authorized document boundary.",
    technicalNote: "Isolated vector embedding index ensures zero cross-tenant or out-of-clearance leakage.",
    icon: Database,
  },
  {
    id: 4,
    title: "4. Answer with exact page sources",
    desc: "Every response provides exact citations linked to high-resolution original page scans.",
    technicalNote: "Strict citation grounding: answers without verified authorized sources are automatically abstained.",
    icon: FileCheck,
  },
];

export function PinnedSteps() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [isReduced, setIsReduced] = useState(false);

  useEffect(() => {
    setIsReduced(prefersReducedMotion());

    if (prefersReducedMotion() || typeof window === "undefined") {
      return;
    }

    const container = containerRef.current;
    const pin = pinRef.current;
    if (!container || !pin) return;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: container,
        start: "top top+=80",
        end: "+=1200",
        pin: pin,
        pinSpacing: true,
        scrub: 0.5,
        onUpdate: (self) => {
          const stepIndex = Math.min(
            STEPS.length - 1,
            Math.floor(self.progress * STEPS.length)
          );
          setActiveStep(stepIndex);
        },
      });
    }, container);

    return () => ctx.revert();
  }, []);

  // For reduced-motion and mobile fallback, show stacked cards
  if (isReduced) {
    return (
      <section aria-labelledby="steps-title" className="rounded-xl border border-line bg-surface p-6 shadow-sm">
        <div className="mb-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-accent">Security Guarantee</span>
          <h2 id="steps-title" className="display text-2xl font-semibold text-ink mt-1">
            How your answer is protected
          </h2>
          <p className="text-sm text-muted mt-1">
            AegisRAG enforces zero-trust access controls before retrieval ever reaches the AI engine.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.id} className="rounded-lg border border-line bg-surface-subtle p-4 space-y-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-ink text-sm">{step.title}</h3>
                <p className="text-xs text-muted leading-relaxed">{step.desc}</p>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div ref={containerRef} className="relative my-8">
      <div ref={pinRef} className="rounded-xl border border-line bg-surface p-6 sm:p-8 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-accent">Zero-Trust Flow</span>
            <h2 className="display text-2xl sm:text-3xl font-semibold text-ink mt-1">
              How your answer is protected
            </h2>
            <p className="text-xs sm:text-sm text-muted mt-0.5">
              Access checks run before the AI sees any document context.
            </p>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-xs text-muted">
            <span>Step {activeStep + 1} of {STEPS.length}</span>
          </div>
        </div>

        {/* Interactive Step Progress & Highlight */}
        <div className="mt-6 grid gap-6 md:grid-cols-[1.2fr_1fr] items-center">
          {/* Steps selector & progress */}
          <div className="space-y-3">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isActive = idx === activeStep;
              const isPast = idx < activeStep;

              return (
                <div
                  key={step.id}
                  className={`flex items-start gap-3.5 rounded-xl p-3.5 transition-all duration-300 ${
                    isActive
                      ? "bg-surface-subtle border border-line shadow-xs translate-x-1"
                      : "opacity-60 hover:opacity-90"
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${
                      isActive
                        ? "bg-ink text-white shadow-xs"
                        : isPast
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-line/70 text-muted"
                    }`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-sm font-semibold ${isActive ? "text-ink" : "text-muted"}`}>
                      {step.title}
                    </h3>
                    <p className="text-xs text-muted leading-relaxed mt-0.5">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Step Feature Box */}
          <div className="rounded-xl border border-line bg-page p-6 space-y-3 min-h-[220px] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-line/80 px-2.5 py-0.5 text-[0.7rem] font-mono uppercase tracking-wider text-muted">
                  Pipeline Stage {activeStep + 1}
                </span>
                <span className="flex items-center gap-1 text-[0.7rem] text-emerald-700 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Guaranteed Secure
                </span>
              </div>
              <h4 className="display text-2xl font-semibold text-ink mt-3">
                {STEPS[activeStep].title.replace(/^\d+\.\s*/, "")}
              </h4>
              <p className="text-sm text-ink leading-relaxed mt-2">
                {STEPS[activeStep].desc}
              </p>
            </div>

            <div className="rounded-lg border border-line/80 bg-surface p-3 text-xs text-muted">
              <strong className="text-ink block mb-0.5">How it works behind the scenes:</strong>
              {STEPS[activeStep].technicalNote}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
