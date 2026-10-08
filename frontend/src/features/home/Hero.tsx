import gsap from "gsap";
import { lazy, Suspense, useLayoutEffect, useRef } from "react";
import { ButtonLink } from "../../components/ui/Button";
import { ShieldCheck } from "lucide-react";

const SheetStack = lazy(() => import("../../components/three/SheetStack"));
const HEADLINE = ["Every answer", "checks who", "is asking."];

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        gsap.timeline({ defaults: { ease: "power4.out" } })
          .from("[data-badge]", { opacity: 0, y: 10, duration: 0.6 })
          .from("[data-line]", { yPercent: 115, duration: 1.1, stagger: 0.09 }, "-=0.4")
          .from("[data-fade]", { opacity: 0, y: 16, duration: 0.8, stagger: 0.08 }, "-=0.6")
          .from("[data-scene]", { opacity: 0, duration: 1.4, ease: "power2.out" }, 0.2);
      }, root);
      return () => ctx.revert();
    });
    return () => media.revert();
  }, []);

  return (
    <section ref={root} className="relative mx-auto grid max-w-6xl items-center gap-6 px-6 pb-20 pt-16 lg:min-h-[calc(100vh-4.5rem)] lg:grid-cols-[1.1fr_1fr] lg:pb-12 lg:pt-8 bg-page">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-accent/5 via-transparent to-transparent"></div>
      
      <div className="z-10">
        <div data-badge className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-3 py-1.5 text-sm font-medium text-accent">
          <ShieldCheck className="h-4 w-4" />
          Enterprise-Grade Secure RAG
        </div>
        
        <h1 className="display text-[clamp(3.2rem,7.8vw,6.5rem)] leading-[1.05] text-ink">
          {HEADLINE.map((line) => (
            <span key={line} className="block overflow-hidden pb-[0.08em]"><span data-line className="block">{line}</span></span>
          ))}
        </h1>
        
        <p data-fade className="mt-8 max-w-lg text-xl leading-relaxed text-muted">
          AegisRAG lets a company ask questions across its documents, scans and spreadsheets. 
          Each person only gets answers from the sources they are allowed to read.
        </p>
        
        <div data-fade className="mt-10 flex flex-wrap items-center gap-4">
          <ButtonLink to="/signin" size="lg" className="px-8 py-3.5 text-lg shadow-sm">
            Open the demo
          </ButtonLink>
          <a href="#how-it-works" className="inline-flex items-center rounded-full border border-line bg-surface px-8 py-3.5 text-lg font-medium text-ink shadow-sm transition-all hover:border-ink hover:bg-surface-subtle">
            See how it works
          </a>
        </div>
      </div>
      
      <div data-scene className="relative h-[24rem] w-full sm:h-[30rem] lg:h-[40rem] z-0">
        <Suspense fallback={null}><SheetStack /></Suspense>
      </div>
    </section>
  );
}
