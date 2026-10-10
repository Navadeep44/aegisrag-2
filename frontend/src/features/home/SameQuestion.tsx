import { animate, AnimatePresence, motion, useInView, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Calculator, Lock } from "lucide-react";

// The 16 rows of the seeded "Expense Claims 2025" table (approved amounts only count towards the total).
const ROWS: [string, string, number, boolean][] = [
  ["EXP-1001", "Engineering", 1840.0, true], ["EXP-1002", "Engineering", 2310.5, true],
  ["EXP-1003", "Engineering", 3125.0, false], ["EXP-1004", "Engineering", 960.0, true],
  ["EXP-1005", "HR", 1450.0, true], ["EXP-1006", "HR", 780.0, false], ["EXP-1007", "HR", 615.0, true],
  ["EXP-1008", "Finance", 4200.0, true], ["EXP-1009", "Finance", 1320.0, false],
  ["EXP-1010", "Executive", 890.75, true], ["EXP-1011", "Executive", 5600.0, true],
  ["EXP-1012", "General", 145.2, true], ["EXP-1013", "General", 230.0, false],
  ["EXP-1014", "IT", 6480.0, true], ["EXP-1015", "IT", 2275.0, true], ["EXP-1016", "Security", 7500.0, true],
];

const PEOPLE = [
  { id: "emil", name: "Emil", role: "Employee · General", sees: (d: string) => d === "General", ring: "from-level-1 to-sky-300" },
  { id: "esha", name: "Esha", role: "Engineer · Engineering", sees: (d: string) => d === "Engineering", ring: "from-level-2 to-amber-300" },
  { id: "farid", name: "Farid", role: "Finance · all departments", sees: () => true, ring: "from-allow to-emerald-300" },
];

function Money({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

export function SameQuestion() {
  const [who, setWho] = useState(PEOPLE[0]);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });

  // Walk through the three people once when the section first appears.
  useEffect(() => {
    if (!inView) return;
    const timers = [setTimeout(() => setWho(PEOPLE[1]), 2200), setTimeout(() => setWho(PEOPLE[2]), 4400)];
    return () => timers.forEach(clearTimeout);
  }, [inView]);

  const visible = ROWS.filter((r) => who.sees(r[1]));
  const total = visible.filter((r) => r[3]).reduce((s, r) => s + r[2], 0);

  return (
    <section id="same-question" className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Row-level access</p>
        <h2 className="font-brand mt-4 text-4xl font-semibold leading-[1.05] text-ink sm:text-5xl">
          Same question. <span className="text-gradient">Different truth.</span>
        </h2>
        <p className="mt-4 text-ink-light">Each row of the expense table carries its own permission. Pick a person.</p>
      </div>

      <div ref={ref} className="paper-card mt-12 overflow-hidden rounded-[28px]">
        {/* Question bar + people */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line/70 px-5 py-4 sm:px-6">
          <p className="text-sm text-ink-light">
            <span className="mr-2 font-mono text-[11px] uppercase tracking-wider text-muted">Ask</span>
            “What is the total amount of approved expense claims?”
          </p>
          <div role="tablist" aria-label="Person asking" className="flex gap-1 rounded-2xl bg-surface-subtle p-1">
            {PEOPLE.map((p) => (
              <button key={p.id} role="tab" aria-selected={who.id === p.id} onClick={() => setWho(p)}
                className="relative rounded-xl px-3 py-2 text-left text-xs">
                {who.id === p.id && (
                  <motion.span layoutId="who" className="absolute inset-0 rounded-xl bg-surface shadow-sm" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                )}
                <span className="relative flex items-center gap-2">
                  <span className={`grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br p-[1.5px] ${p.ring}`}>
                    <span className="grid h-full w-full place-items-center rounded-full bg-surface text-[10px] font-bold text-ink">{p.name[0]}</span>
                  </span>
                  <span className="font-semibold text-ink">{p.name}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.35fr_1fr]">
          {/* Rows */}
          <div className="grid grid-cols-2 gap-2 p-5 sm:grid-cols-4 sm:p-6">
            {ROWS.map(([id, dept, amount, approved]) => {
              const ok = who.sees(dept);
              return (
                <motion.div key={id} layout animate={{ opacity: ok ? 1 : 0.55, filter: ok ? "blur(0px)" : "blur(1.5px)" }}
                  transition={{ duration: 0.45 }}
                  className={`relative rounded-xl border p-2.5 ${ok ? "border-accent/30 bg-accent-light/50" : "border-line bg-surface-subtle"}`}>
                  <p className="font-mono text-[10px] text-muted">{id}</p>
                  <p className="text-xs font-semibold text-ink">{dept}</p>
                  <p className={`mt-1 font-mono text-[11px] ${approved ? "text-ink-light" : "text-muted line-through"}`}>
                    ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </p>
                  <AnimatePresence>
                    {!ok && (
                      <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
                        className="absolute inset-0 grid place-items-center rounded-xl">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-surface text-deny shadow-sm"><Lock className="h-3.5 w-3.5" /></span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>

          {/* Answer */}
          <div className="flex flex-col justify-center gap-5 border-t border-line/70 bg-[linear-gradient(180deg,#fffdf8,#f9f3e6)] p-6 lg:border-l lg:border-t-0 lg:p-8">
            <div className="flex items-center gap-3">
              <span className={`grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br p-[2px] ${who.ring}`}>
                <span className="font-brand grid h-full w-full place-items-center rounded-full bg-surface text-lg font-semibold text-ink">{who.name[0]}</span>
              </span>
              <div>
                <p className="font-brand text-lg font-semibold text-ink">{who.name}</p>
                <p className="text-xs text-muted">{who.role}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Answer</p>
              <p className="font-brand mt-1 text-5xl font-semibold tabular-nums text-ink"><Money value={total} /></p>
              <p className="mt-2 text-sm text-ink-light">
                from <b className="text-ink">{visible.length}</b> of 16 rows the database returned for {who.name}
              </p>
            </div>
            <p className="inline-flex items-center gap-2 self-start rounded-lg border border-emerald-600/20 bg-emerald-600/5 px-2.5 py-1.5 font-mono text-[11px] text-emerald-800">
              <Calculator className="h-3.5 w-3.5" /> SUM(Amount) WHERE Status = Approved
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
