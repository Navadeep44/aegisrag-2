import { useLayoutEffect, useRef } from "react";
import { Calculator, Fingerprint, Lock, Search, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { gsap, prefersReducedMotion } from "../../lib/motion";

type Step = { icon: LucideIcon; title: string; body: string; code: string };

const STEPS: Step[] = [
  { icon: Fingerprint, title: "Who is asking", body: "Roles, clearance and department are read from the database, not from the request.", code: "user = db.get(User, token.sub)" },
  { icon: Lock, title: "Permission filter in SQL", body: "Document grants and row rules become part of the query itself. Restricted chunks never leave the database.", code: "WHERE readable_chunk_clause(user)" },
  { icon: Search, title: "Hybrid search", body: "Meaning (Gemini vectors) and exact terms (BM25), merged by rank.", code: "rrf(dense, bm25, k=60)" },
  { icon: Calculator, title: "Exact maths for tables", body: "Totals, averages and counts are computed in code over the rows you may read.", code: "SUM(Amount) WHERE Status = Approved" },
  { icon: Sparkles, title: "Answer from evidence only", body: "The model returns short points, each pointing at the evidence it used.", code: "{ points: [{ text, citations }] }" },
  { icon: ShieldCheck, title: "Every claim checked", body: "Numbers and wording are matched against the cited text. Anything unsupported is removed.", code: "verify(claim, cited_chunk)" },
];

/** Scroll-driven walkthrough: the rail fills as you scroll and each step settles into place. */
export function Pipeline() {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (prefersReducedMotion() || !root.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo("[data-rail]", { scaleY: 0 }, {
        scaleY: 1, ease: "none", transformOrigin: "top",
        scrollTrigger: { trigger: "[data-steps]", start: "top 70%", end: "bottom 60%", scrub: 0.6 },
      });
      gsap.utils.toArray<HTMLElement>("[data-step]").forEach((el) => {
        gsap.from(el, {
          y: 40, opacity: 0, duration: 0.9, ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 85%" },
        });
        gsap.to(el.querySelector("[data-dot]"), {
          backgroundColor: "#0f766e", color: "#fffcf6", borderColor: "#0f766e",
          scrollTrigger: { trigger: el, start: "top 62%", toggleActions: "play none none reverse" },
        });
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} id="pipeline" className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">How a question travels</p>
          <h2 className="font-brand mt-4 text-4xl font-semibold leading-[1.05] text-ink sm:text-5xl">
            Six checks between a question and its answer.
          </h2>
          <p className="mt-5 max-w-sm text-ink-light">
            The access decision happens first, inside the database. Everything after it only ever sees what you may read.
          </p>
        </div>

        <ol data-steps className="relative space-y-5 pl-14">
          <span aria-hidden className="absolute left-[19px] top-2 h-[calc(100%-1rem)] w-px bg-line" />
          <span aria-hidden data-rail className="absolute left-[19px] top-2 h-[calc(100%-1rem)] w-px origin-top bg-accent" />
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={s.title} data-step className="relative">
                <span data-dot className="absolute -left-14 top-5 grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-accent transition-colors">
                  <Icon className="h-4.5 w-4.5" strokeWidth={1.9} />
                </span>
                <div className="paper-card rounded-2xl p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-brand text-lg font-semibold text-ink">{s.title}</h3>
                    <span className="font-mono text-[11px] text-muted-light">{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-light">{s.body}</p>
                  <code className="mt-3 inline-block rounded-lg bg-surface-subtle px-2.5 py-1 font-mono text-[12px] text-accent">{s.code}</code>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
