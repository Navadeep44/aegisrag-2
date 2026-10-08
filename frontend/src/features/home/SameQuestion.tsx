import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, useRef } from "react";
import { Reveal } from "../../components/motion/Reveal";
import { Banded, Level } from "../../components/ui/Classification";
import { User, Lock, FileX, CheckCircle2, ShieldAlert, Sparkles, FileText } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const QUESTION = "What was our annual revenue in FY2025?";

export function SameQuestion() {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        gsap.from("[data-comparison-card]", {
          y: 40,
          opacity: 0,
          duration: 0.8,
          stagger: 0.2,
          ease: "power3.out",
          scrollTrigger: { trigger: "[data-comparison-grid]", start: "top 80%" },
        });
      }, root);
      return () => ctx.revert();
    });
    return () => media.revert();
  }, []);

  return (
    <section id="same-question" ref={root} className="border-t border-line bg-surface py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        {/* Section Header */}
        <Reveal>
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-accent-light px-3 py-1 text-xs font-semibold text-accent">
              <Lock className="h-3.5 w-3.5" />
              <span>Real-Time Authorization Gate</span>
            </div>
            <h2 className="display text-[clamp(2.4rem,4.8vw,3.8rem)] text-ink leading-tight">
              One question. Two people. Two different answers.
            </h2>
            <p className="text-base sm:text-lg leading-relaxed text-muted">
              The FY2025 revenue report is classified as <span className="font-semibold text-ink">Confidential (Level 2)</span> and restricted to Finance.
              Because permissions are enforced before retrieval, the document is mathematically excluded from unauthorized queries.
            </p>
          </div>
        </Reveal>

        {/* Side-by-Side Dual Persona Comparison Grid */}
        <div data-comparison-grid className="mt-14 grid gap-8 lg:grid-cols-2">
          {/* Persona 1: Farid (Finance Director - Authorized) */}
          <div
            data-comparison-card
            className="flex flex-col justify-between rounded-3xl border-2 border-emerald-500/20 bg-page p-6 sm:p-8 shadow-xs relative overflow-hidden"
          >
            <div className="space-y-6">
              {/* Persona Header Bar */}
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white font-bold text-sm shadow-xs">
                    FD
                  </div>
                  <div>
                    <p className="text-base font-bold text-ink">Farid (Finance)</p>
                    <p className="text-xs text-muted font-medium">Role: Director • Clearance: Confidential (L2)</p>
                  </div>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Access Permitted
                </span>
              </div>

              {/* Chat Simulation */}
              <div className="space-y-3">
                {/* User Prompt */}
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-tr-xs bg-ink px-4 py-2.5 text-xs sm:text-sm text-white shadow-xs max-w-[85%]">
                    {QUESTION}
                  </div>
                </div>

                {/* Assistant Answer */}
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-xs border border-line bg-surface p-4 text-xs sm:text-sm text-ink shadow-xs max-w-[95%] space-y-2">
                    <p className="leading-relaxed">
                      Total annual revenue for FY2025 was <span className="font-semibold text-emerald-700">$48.2 million</span>, representing a 12% increase from $43.0 million in FY2024.
                    </p>
                    <div className="flex items-center gap-1.5 pt-1 text-[0.7rem] text-muted">
                      <Sparkles className="h-3 w-3 text-accent" />
                      <span>Grounded with verified passage chunk #1</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Cited Passage Preview Band */}
            <div className="mt-6 rounded-2xl border border-amber-200/80 bg-amber-50/60 p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-700" />
                  <span className="text-xs font-bold text-amber-900">FY2025 Revenue Report.pdf</span>
                </div>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-amber-800">
                  Page 1 • L2
                </span>
              </div>
              <p className="mt-1.5 text-xs text-amber-900/80 leading-snug">
                "Consolidated revenue reached $48.2M for the fiscal period ended December 31..."
              </p>
            </div>
          </div>

          {/* Persona 2: Emil (General Employee - Zero Knowledge Protection) */}
          <div
            data-comparison-card
            className="flex flex-col justify-between rounded-3xl border border-line bg-page p-6 sm:p-8 shadow-xs relative overflow-hidden"
          >
            <div className="space-y-6">
              {/* Persona Header Bar */}
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-700 text-white font-bold text-sm shadow-xs">
                    EM
                  </div>
                  <div>
                    <p className="text-base font-bold text-ink">Emil (Engineering)</p>
                    <p className="text-xs text-muted font-medium">Role: Member • Clearance: Internal (L1)</p>
                  </div>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
                  <Lock className="h-3.5 w-3.5 text-slate-500" />
                  Zero-Leakage Barrier
                </span>
              </div>

              {/* Chat Simulation */}
              <div className="space-y-3">
                {/* User Prompt */}
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-tr-xs bg-ink px-4 py-2.5 text-xs sm:text-sm text-white shadow-xs max-w-[85%]">
                    {QUESTION}
                  </div>
                </div>

                {/* Assistant Answer */}
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-xs border border-dashed border-slate-300 bg-surface p-4 text-xs sm:text-sm text-slate-700 shadow-xs max-w-[95%] space-y-2">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                      <FileX className="h-4 w-4 text-slate-400" />
                      <span>No authorized documents found</span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">
                      I could not find an authorized source for that information within your permitted document boundaries.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Zero-Leakage Guarantee Note */}
            <div className="mt-6 rounded-2xl border border-line bg-surface p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <ShieldAlert className="h-4 w-4 text-accent" />
                <span>Deterministic Privacy Guarantee</span>
              </div>
              <p className="mt-1 text-xs text-muted leading-snug">
                The response is identical whether the confidential file is restricted or non-existent, ensuring zero inference leakage.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

