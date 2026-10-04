import gsap from "gsap";
import { lazy, Suspense, useLayoutEffect, useRef } from "react";
import { ButtonLink } from "../../components/ui/Button";

const SheetStack = lazy(() => import("../../components/three/SheetStack"));
const HEADLINE = ["Every answer", "checks who", "is asking."];

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        gsap.timeline({ defaults: { ease: "power4.out" } })
          .from("[data-line]", { yPercent: 115, duration: 1.1, stagger: 0.09 })
          .from("[data-fade]", { opacity: 0, y: 16, duration: 0.8, stagger: 0.08 }, "-=0.6")
          .from("[data-scene]", { opacity: 0, duration: 1.4, ease: "power2.out" }, 0.2);
      }, root);
      return () => ctx.revert();
    });
    return () => media.revert();
  }, []);

  return (
    <section ref={root} className="mx-auto grid max-w-6xl items-center gap-6 px-6 pb-16 pt-14 lg:min-h-[calc(100vh-4.5rem)] lg:grid-cols-[1.05fr_1fr] lg:pb-10 lg:pt-6">
      <div>
        <h1 className="display text-[clamp(3rem,7.4vw,6rem)]">
          {HEADLINE.map((line) => (
            <span key={line} className="block overflow-hidden pb-[0.08em]"><span data-line className="block">{line}</span></span>
          ))}
        </h1>
        <p data-fade className="mt-7 max-w-md text-lg leading-relaxed text-muted">
          AegisRAG lets a company ask questions across its documents, scans and spreadsheets.
          Each person only gets answers from the sources they are allowed to read.
        </p>
        <div data-fade className="mt-9 flex flex-wrap gap-3">
          <ButtonLink to="/signin" size="lg">Open the demo</ButtonLink>
          <a href="#how-it-works" className="inline-flex items-center rounded-full border border-line bg-surface px-6 py-3 text-[0.95rem] font-medium transition-colors hover:border-ink">
            See how it works
          </a>
        </div>
      </div>
      <div data-scene className="h-[22rem] sm:h-[28rem] lg:h-[36rem]">
        <Suspense fallback={null}><SheetStack /></Suspense>
      </div>
    </section>
  );
}
