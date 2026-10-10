import { motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import { lazy, Suspense, useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Lock, ShieldCheck } from "lucide-react";
import { gsap, prefersReducedMotion } from "../../lib/motion";

const SheetStack = lazy(() => import("../../components/three/SheetStack"));

const LINES = ["Answers only from", "what you’re cleared", "to see."];
const STAMPS = [
  { label: "Internal", cls: "text-level-1 border-level-1/50" },
  { label: "Confidential", cls: "text-level-2 border-level-2/50" },
  { label: "Restricted", cls: "text-level-3 border-level-3/50" },
];

/** The 3D drawer of documents, framed like a case file. */
function CaseFile() {
  return (
    <div data-scene className="relative mx-auto w-full max-w-[560px]">
      {/* Folder tab */}
      <div className="relative z-10 ml-8 inline-flex items-center gap-2 rounded-t-xl border border-b-0 border-line bg-[#fbf6ea] px-4 pb-2 pt-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-light">Case file · Acme Corp</span>
      </div>

      <div className="paper-card relative -mt-px overflow-hidden rounded-[28px] rounded-tl-xl">
        <div className="flex items-center justify-between border-b border-line/70 px-5 py-3">
          <div className="flex gap-1.5">
            {STAMPS.map((s, i) => (
              <motion.span key={s.label} initial={{ opacity: 0, scale: 1.4, rotate: -8 }} animate={{ opacity: 1, scale: 1, rotate: -2 }}
                transition={{ delay: 0.9 + i * 0.12, type: "spring", stiffness: 380, damping: 18 }}
                className={`rounded-[5px] border-[1.5px] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${s.cls}`}>
                {s.label}
              </motion.span>
            ))}
          </div>
          <span className="font-mono text-[10px] text-muted">9 sheets · 6 readable</span>
        </div>

        {/* Canvas: sized so the stack fills the frame without crowding the headline */}
        <div className="relative h-[19rem] sm:h-[23rem] lg:h-[26rem]">
          <div className="absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_45%,rgba(15,118,110,0.10),transparent_70%)]" />
          <Suspense fallback={<div className="skeleton absolute inset-8 rounded-2xl" />}>
            <SheetStack />
          </Suspense>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2, duration: 0.6 }}
        className="paper-card absolute -left-4 top-24 hidden items-center gap-2.5 rounded-2xl px-3 py-2.5 sm:flex">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-allow-bg text-allow"><CheckCircle2 className="h-4 w-4" /></span>
        <span className="text-xs leading-tight">
          <span className="block font-bold text-ink">Readable sheets lift</span>
          <span className="text-muted">into a cited answer</span>
        </span>
      </motion.div>
      <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.4, duration: 0.6 }}
        className="paper-card absolute -right-4 bottom-10 hidden items-center gap-2.5 rounded-2xl px-3 py-2.5 sm:flex">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-deny-bg text-deny"><Lock className="h-4 w-4" /></span>
        <span className="text-xs leading-tight">
          <span className="block font-bold text-ink">Restricted stay down</span>
          <span className="text-muted">never loaded, never sent</span>
        </span>
      </motion.div>
    </div>
  );
}

export function Hero() {
  const root = useRef<HTMLElement>(null);

  // Cursor-following light on the parchment.
  const mx = useMotionValue(70);
  const my = useMotionValue(30);
  const sx = useSpring(mx, { stiffness: 60, damping: 20 });
  const sy = useSpring(my, { stiffness: 60, damping: 20 });
  const light = useMotionTemplate`radial-gradient(520px circle at ${sx}% ${sy}%, rgba(15,118,110,0.10), transparent 70%)`;

  useLayoutEffect(() => {
    if (prefersReducedMotion() || !root.current) return;
    const ctx = gsap.context(() => {
      gsap.timeline({ defaults: { ease: "expo.out" } })
        .from("[data-eyebrow]", { y: 12, opacity: 0, duration: 0.8 })
        .from("[data-line]", { yPercent: 110, duration: 1.2, stagger: 0.09 }, "-=0.5")
        .from("[data-fade]", { y: 16, opacity: 0, duration: 0.9, stagger: 0.08 }, "-=0.8")
        .from("[data-scene]", { y: 30, opacity: 0, scale: 0.97, duration: 1.3 }, 0.15);
      // Gentle parallax: the case file drifts up slower than the page.
      gsap.to("[data-scene]", {
        yPercent: -8, ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} className="paper-grain relative overflow-hidden"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(((e.clientX - r.left) / r.width) * 100);
        my.set(((e.clientY - r.top) / r.height) * 100);
      }}>
      <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: light }} />
      <div aria-hidden className="grid-bg pointer-events-none absolute inset-0 opacity-50" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-14 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-28 lg:pt-20">
        <div>
          <span data-eyebrow className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-light/70 px-3 py-1.5 text-xs font-semibold text-accent">
            <ShieldCheck className="h-3.5 w-3.5" /> Secure multi-modal RAG · PS-01
          </span>

          <h1 className="font-brand mt-6 text-[clamp(2.5rem,4.6vw,4.5rem)] font-semibold leading-[1.02] text-ink">
            {LINES.map((line, i) => (
              <span key={line} className="block overflow-hidden pb-[0.08em]">
                <span data-line className={`block ${i === 1 ? "text-gradient" : ""}`}>{line}</span>
              </span>
            ))}
          </h1>

          <p data-fade className="mt-6 max-w-[34rem] text-lg leading-relaxed text-ink-light">
            One assistant for PDFs, scans, photos and database rows. Permissions are checked inside the database
            query, and every claim links to the exact line it came from.
          </p>

          <div data-fade className="mt-9 flex flex-wrap items-center gap-3">
            <Link to="/signin" className="group btn-primary inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm">
              Try a persona <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <a href="#same-question" className="inline-flex items-center gap-2 rounded-2xl border border-line bg-surface/80 px-6 py-3.5 text-sm font-semibold text-ink transition-colors hover:border-accent/40">
              See the same question twice
            </a>
          </div>

          <dl data-fade className="mt-12 grid max-w-lg grid-cols-3 divide-x divide-line border-y border-line py-4">
            {[["0", "restricted chunks sent to the model"], ["Every", "claim checked against its source"], ["4", "data types in one index"]].map(([v, l]) => (
              <div key={l} className="px-4 first:pl-0">
                <dt className="font-brand text-2xl font-semibold text-ink">{v}</dt>
                <dd className="mt-0.5 text-[11px] leading-snug text-muted">{l}</dd>
              </div>
            ))}
          </dl>
        </div>

        <CaseFile />
      </div>
    </section>
  );
}
