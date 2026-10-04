import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, useRef } from "react";

gsap.registerPlugin(ScrollTrigger);

const STEPS = [
  ["Identify who is asking", "Roles and clearance are loaded from the database on every request. Nothing the browser sends can change them."],
  ["Filter by permission", "A deny-by-default rule decides which documents this person may read. It is part of the search query itself."],
  ["Search only what remains", "Meaning-based and keyword search run over the permitted passages from PDFs, scans, images and spreadsheets."],
  ["Answer from the evidence", "The model sees only those passages, treats them as data rather than instructions, and must cite what it used."],
  ["Check and record", "Citations that were not in the evidence are thrown out. Each decision is logged without storing the question."],
];

export function HowItWorks() {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        gsap.fromTo("[data-rail]", { scaleY: 0 }, {
          scaleY: 1, ease: "none",
          scrollTrigger: { trigger: "[data-steps]", start: "top 70%", end: "bottom 60%", scrub: 0.6 },
        });
        gsap.utils.toArray<HTMLElement>("[data-step]").forEach((step) => {
          gsap.from(step, {
            opacity: 0.15, x: 18, duration: 0.7, ease: "power3.out",
            scrollTrigger: { trigger: step, start: "top 78%" },
          });
        });
      }, root);
      return () => ctx.revert();
    });
    return () => media.revert();
  }, []);

  return (
    <section id="how-it-works" ref={root} className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="display text-[clamp(2.2rem,4.6vw,3.6rem)]">From question to answer in five steps.</h2>
          <p className="mt-5 max-w-sm text-lg leading-relaxed text-muted">
            The language model never decides what someone may see. That is settled before it is called.
          </p>
        </div>
        <ol data-steps className="relative space-y-12 pl-10">
          <span aria-hidden="true" className="absolute bottom-2 left-[0.6rem] top-2 w-px bg-line" />
          <span data-rail aria-hidden="true" className="absolute bottom-2 left-[0.6rem] top-2 w-px origin-top bg-ink" />
          {STEPS.map(([title, body], i) => (
            <li key={title} data-step className="relative">
              <span aria-hidden="true" className="display absolute -left-10 top-0 flex h-5 w-5 items-center justify-center rounded-full border border-ink bg-page text-xs">{i + 1}</span>
              <h3 className="display text-3xl">{title}</h3>
              <p className="mt-2 max-w-lg leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
