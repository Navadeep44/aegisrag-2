import { motion } from "framer-motion";
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Lock, XCircle } from "lucide-react";
import { LogoMark } from "../../components/brand/Logo";

const SheetStack = lazy(() => import("../../components/three/SheetStack"));

function DocumentScene() {
  return (
    <div className="relative h-[22rem] w-full sm:h-[28rem] lg:h-[34rem]">
      <div className="grid-bg absolute -inset-6 opacity-70" />
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2, delay: 0.2 }}
        className="absolute inset-0 overflow-hidden rounded-[2rem] border border-line bg-gradient-to-br from-accent-light/70 via-surface to-ai-light/60 shadow-md">
        <Suspense fallback={null}>
          <SheetStack />
        </Suspense>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
        className="glass absolute left-4 top-5 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-ink">
        <CheckCircle2 className="h-4 w-4 text-allow" /> Readable sheets lift into the answer
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }}
        className="glass absolute bottom-5 right-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-ink">
        <XCircle className="h-4 w-4 text-deny" /> Restricted sheets stay redacted
      </motion.div>
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.3, type: "spring" }}
        className="absolute bottom-5 left-4 grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-surface shadow-md">
        <LogoMark className="h-9 w-9" />
      </motion.div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-16 lg:grid-cols-[1fr_1.05fr] lg:pt-24">
        <div>
          <motion.span initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="chip mb-6 border-accent/30 bg-accent-light text-accent">
            <Lock className="h-3 w-3" /> PS-01 · Secure multi-modal RAG
          </motion.span>
          <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="display text-5xl leading-[1.02] text-ink sm:text-6xl lg:text-7xl">
            Answers only from <span className="text-gradient">what you're cleared</span> to see.
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
            className="mt-6 max-w-md text-lg text-muted">
            PDFs, scans, photos and database rows — permission-checked in SQL, every claim cited.
          </motion.p>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="mt-8 flex flex-wrap gap-3">
            <Link to="/signin" className="btn-primary inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm">
              Try a persona <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#same-question" className="inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-6 py-3.5 text-sm font-semibold text-ink hover:border-accent/40">
              See it decide
            </a>
          </motion.div>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-3">
            {[["0", "restricted chunks sent to the model"], ["100%", "claims carry a source"], ["4", "data types, one index"]].map(([v, l]) => (
              <div key={l} className="border-l-2 border-accent/40 pl-3">
                <p className="display text-2xl text-ink">{v}</p>
                <p className="text-[11px] leading-tight text-muted">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <DocumentScene />
      </div>
    </section>
  );
}
