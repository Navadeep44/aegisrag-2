import gsap from "gsap";
import { lazy, Suspense, useLayoutEffect, useRef } from "react";
import { ButtonLink } from "../../components/ui/Button";
import { ShieldCheck, ArrowRight, CheckCircle2, Lock, Sparkles } from "lucide-react";

const SheetStack = lazy(() => import("../../components/three/SheetStack"));
const HEADLINE = ["Every answer", "checks who", "is asking."];

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        gsap.timeline({ defaults: { ease: "power4.out" } })
          .from("[data-badge]", { opacity: 0, y: 14, duration: 0.7 })
          .from("[data-line]", { yPercent: 120, duration: 1.1, stagger: 0.1 }, "-=0.4")
          .from("[data-fade]", { opacity: 0, y: 16, duration: 0.8, stagger: 0.08 }, "-=0.6")
          .from("[data-guarantees]", { opacity: 0, y: 12, duration: 0.8 }, "-=0.4")
          .from("[data-scene]", { opacity: 0, scale: 0.96, duration: 1.4, ease: "power2.out" }, 0.2);
      }, root);
      return () => ctx.revert();
    });
    return () => media.revert();
  }, []);

  return (
    <section
      ref={root}
      className="relative mx-auto grid max-w-6xl items-center gap-8 px-6 pb-20 pt-12 lg:min-h-[calc(100vh-4.5rem)] lg:grid-cols-[1.1fr_1fr] lg:pb-16 lg:pt-8"
    >
      {/* Subtle Background Radial Glow */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(79,70,229,0.08),rgba(255,255,255,0))] pointer-events-none" />

      {/* Left Content Column */}
      <div className="z-10 flex flex-col justify-center">
        {/* Eyebrow / Security Badge */}
        <div data-badge className="mb-5 inline-flex items-center gap-2 self-start rounded-full border border-accent/20 bg-accent-light px-3.5 py-1.5 text-xs font-semibold text-accent shadow-xs">
          <span className="flex h-2 w-2 rounded-full bg-accent animate-pulse" />
          <ShieldCheck className="h-4 w-4" />
          <span>Zero-Trust Enterprise RAG</span>
        </div>

        {/* Primary Headline */}
        <h1 className="display text-[clamp(3.2rem,7.5vw,5.8rem)] font-normal tracking-tight text-ink leading-[1.02]">
          {HEADLINE.map((line) => (
            <span key={line} className="block overflow-hidden pb-[0.06em]">
              <span data-line className="block">{line}</span>
            </span>
          ))}
        </h1>

        {/* Subtitle / Value Proposition */}
        <p data-fade className="mt-6 max-w-lg text-lg sm:text-xl leading-relaxed text-muted">
          AegisRAG enables companies to query sensitive documents, financial scans, and records.
          <span className="font-semibold text-ink"> Access checks run at the database layer</span> before the AI engine ever sees a document.
        </p>

        {/* CTA Buttons */}
        <div data-fade className="mt-8 flex flex-wrap items-center gap-3.5">
          <ButtonLink to="/signin" size="lg" className="px-7 py-3.5 text-base font-semibold shadow-sm hover:shadow-md transition-all flex items-center gap-2 group">
            <span>Open Interactive Demo</span>
            <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
          </ButtonLink>
          <a
            href="#same-question"
            className="inline-flex items-center rounded-full border border-line bg-surface px-6 py-3.5 text-base font-medium text-ink shadow-xs transition-all hover:border-ink hover:bg-surface-subtle"
          >
            See Live Comparison
          </a>
        </div>

        {/* Key Architectural Guarantees Strip */}
        <div data-guarantees className="mt-10 flex flex-wrap items-center gap-y-2 gap-x-6 border-t border-line/80 pt-6 text-xs text-muted">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-allow" />
            <span className="font-medium text-ink">Pre-Retrieval SQL Gate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-allow" />
            <span className="font-medium text-ink">Zero Data Leakage</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-allow" />
            <span className="font-medium text-ink">100% Page Grounding</span>
          </div>
        </div>
      </div>

      {/* Right 3D Scene Column */}
      <div data-scene className="relative h-[22rem] w-full sm:h-[28rem] lg:h-[36rem] flex items-center justify-center">
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-accent/5 via-surface to-accent/5 border border-line/50 shadow-xs overflow-hidden">
          <Suspense fallback={null}>
            <SheetStack />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

