import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, useRef } from "react";
import { Search, Shield, Cpu, Database, CheckCircle } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const STEPS = [
  {
    title: "Identify who is asking",
    body: "Roles and clearance are loaded from the database on every request. Nothing the browser sends can change them.",
    icon: <Database className="h-6 w-6 text-accent" />
  },
  {
    title: "Filter by permission",
    body: "A deny-by-default rule decides which documents this person may read. It is part of the search query itself.",
    icon: <Shield className="h-6 w-6 text-accent" />
  },
  {
    title: "Search only what remains",
    body: "Meaning-based and keyword search run over the permitted passages from PDFs, scans, images and spreadsheets.",
    icon: <Search className="h-6 w-6 text-accent" />
  },
  {
    title: "Answer from the evidence",
    body: "The model sees only those passages, treats them as data rather than instructions, and must cite what it used.",
    icon: <Cpu className="h-6 w-6 text-accent" />
  },
  {
    title: "Check and record",
    body: "Citations that were not in the evidence are thrown out. Each decision is logged without storing the question.",
    icon: <CheckCircle className="h-6 w-6 text-accent" />
  }
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
            opacity: 0, y: 30, duration: 0.8, ease: "power3.out",
            scrollTrigger: { trigger: step, start: "top 80%" },
          });
        });
      }, root);
      return () => ctx.revert();
    });
    return () => media.revert();
  }, []);

  return (
    <section id="how-it-works" ref={root} className="border-t border-line bg-page">
      <div className="mx-auto grid max-w-6xl gap-16 px-6 py-28 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="lg:sticky lg:top-32 lg:self-start rounded-3xl border border-line bg-surface p-8 shadow-sm">
          <div className="absolute -inset-px rounded-3xl bg-gradient-to-b from-surface to-surface-subtle -z-10 blur-sm opacity-50"></div>
          <h2 className="display text-[clamp(2.4rem,4.8vw,3.8rem)] text-ink leading-tight">From question to answer in five steps.</h2>
          <p className="mt-6 text-xl leading-relaxed text-muted">
            The language model never decides what someone may see. That is settled before it is called.
          </p>
        </div>
        <ol data-steps className="relative space-y-8 pl-12">
          <span aria-hidden="true" className="absolute bottom-6 left-[1.1rem] top-6 w-0.5 bg-line" />
          <span data-rail aria-hidden="true" className="absolute bottom-6 left-[1.1rem] top-6 w-0.5 origin-top bg-accent" />
          {STEPS.map((step, i) => (
            <li key={step.title} data-step className="relative">
              <span aria-hidden="true" className="absolute -left-[4.2rem] top-1 flex h-10 w-10 items-center justify-center rounded-full border-2 border-surface bg-accent text-white font-bold shadow-sm z-10">
                {i + 1}
              </span>
              <div className="rounded-2xl border border-line bg-surface p-7 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md">
                <div className="mb-4 inline-flex rounded-xl bg-accent/10 p-3">
                  {step.icon}
                </div>
                <h3 className="display text-2xl text-ink">{step.title}</h3>
                <p className="mt-3 text-lg leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
