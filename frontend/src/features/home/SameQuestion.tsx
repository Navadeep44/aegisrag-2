import { motion } from "framer-motion";
import { Calculator, CheckCircle2, SearchX, ShieldCheck } from "lucide-react";

const PEOPLE = [
  {
    name: "Emil", role: "Employee · General", level: "L1 Internal", ring: "from-level-1 to-sky-300",
    answers: [
      { q: "What was our annual revenue?", tone: "warn", icon: SearchX, a: "No authorized source", note: "Revenue report never entered the search" },
      { q: "Total approved expense claims?", tone: "computed", icon: Calculator, a: "$145.20", note: "1 row · General dept only" },
    ],
  },
  {
    name: "Farid", role: "Finance", level: "L2 Confidential", ring: "from-level-2 to-amber-300",
    answers: [
      { q: "What was our annual revenue?", tone: "allow", icon: ShieldCheck, a: "$48.2 million", note: "Cited: Revenue Report, page 1" },
      { q: "Total approved expense claims?", tone: "computed", icon: Calculator, a: "$34,266.45", note: "12 rows · all departments" },
    ],
  },
];

const TONE = {
  warn: "border-warn-border bg-warn-bg text-warn",
  allow: "border-allow-border bg-allow-bg text-allow",
  computed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
};

export function SameQuestion() {
  return (
    <section id="same-question" className="mx-auto max-w-7xl px-5 py-20">
      <div className="mb-10 text-center">
        <p className="chip mx-auto mb-3"><ShieldCheck className="h-3 w-3 text-accent" /> Document + row-level access</p>
        <h2 className="display text-4xl text-ink sm:text-5xl">Same question. <span className="text-gradient">Different truth.</span></h2>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {PEOPLE.map((p, pi) => (
          <motion.div key={p.name} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ delay: pi * 0.12 }} className="glass rounded-3xl p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className={`grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br p-[2px] ${p.ring}`}>
                <span className="display grid h-full w-full place-items-center rounded-full bg-surface text-lg text-ink">{p.name[0]}</span>
              </span>
              <div>
                <p className="display text-lg text-ink">{p.name}</p>
                <p className="text-xs text-muted">{p.role} · {p.level}</p>
              </div>
            </div>
            <div className="space-y-3">
              {p.answers.map((a) => {
                const Icon = a.icon;
                return (
                  <div key={a.q} className="rounded-2xl border border-line bg-surface-subtle p-3.5">
                    <p className="text-xs font-semibold text-muted">“{a.q}”</p>
                    <div className="mt-2 flex items-center gap-3">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${TONE[a.tone as keyof typeof TONE]}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="display text-xl text-ink">{a.a}</p>
                        <p className="flex items-center gap-1 text-[11px] text-muted"><CheckCircle2 className="h-3 w-3 text-allow" /> {a.note}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
