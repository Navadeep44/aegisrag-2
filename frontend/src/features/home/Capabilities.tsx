import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, CircleSlash, EyeOff, Quote, ScanLine, ShieldCheck } from "lucide-react";
import { LogoMark } from "../../components/brand/Logo";

const NOTICE = ["ACME CORP - VISITOR POLICY", "Badge pickup: Reception B, Floor 2", "Reception hours: 08:00 - 18:00", "Security desk extension: 4400", "Lost badge fee: $25"];
const CLAIMS = [
  { t: "Full-time employees receive 24 days of paid leave.", ok: true },
  { t: "Up to 5 unused days carry over.", ok: true },
  { t: "Employees receive 30 days of leave.", ok: false },
];

function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className={`paper-card group relative overflow-hidden rounded-[24px] p-6 ${className}`}>
      {children}
    </motion.div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">{children}</p>;
}

/** OCR: a scan line passes over the photographed visitor notice from the demo data. */
function OcrCard() {
  return (
    <Card className="lg:col-span-2">
      <Label>Scans & photos</Label>
      <h3 className="font-brand mt-2 text-2xl font-semibold text-ink">Read text that has no text layer.</h3>
      <p className="mt-1.5 max-w-md text-sm text-ink-light">Gemini vision transcribes photos and scanned pages; an offline OCR engine takes over when the model is unavailable.</p>
      <div className="relative mt-6 grid gap-4 sm:grid-cols-2">
        <div className="relative overflow-hidden rounded-xl border border-line bg-[#f4efe2] p-4 font-mono text-[12px] leading-6 text-ink-light">
          {NOTICE.map((l) => <p key={l} className="whitespace-pre">{l}</p>)}
          <span className="pointer-events-none absolute inset-x-0 top-0 h-10 animate-scan bg-gradient-to-b from-transparent via-accent/25 to-transparent motion-reduce:hidden" />
        </div>
        <div className="flex flex-col justify-center gap-2 rounded-xl border border-accent/25 bg-accent-light/50 p-4">
          <span className="flex items-center gap-2 text-xs font-semibold text-accent"><ScanLine className="h-4 w-4" /> Indexed as text</span>
          <p className="text-sm text-ink">“What is the lost badge fee?”</p>
          <p className="font-brand text-3xl font-semibold text-ink">$25</p>
          <p className="text-[11px] text-muted">Cited: Visitor Policy Notice (photo) · image · OCR</p>
        </div>
      </div>
    </Card>
  );
}

/** Claim checking: supported claims tick, an invented number gets struck out. */
function ClaimsCard() {
  const ref = useRef<HTMLUListElement>(null);
  const seen = useInView(ref, { once: true, margin: "-15% 0px" });
  return (
    <Card>
      <Label>Grounding</Label>
      <h3 className="font-brand mt-2 text-2xl font-semibold text-ink">Every claim is checked.</h3>
      <ul ref={ref} className="mt-5 space-y-2.5">
        {CLAIMS.map((c, i) => (
          <motion.li key={c.t} initial={{ opacity: 0, x: -8 }} animate={seen ? { opacity: 1, x: 0 } : {}} transition={{ delay: 0.25 + i * 0.35 }}
            className={`flex gap-2.5 rounded-xl border p-2.5 text-sm ${c.ok ? "border-allow-border bg-allow-bg/60 text-ink" : "border-deny-border bg-deny-bg/60 text-muted line-through"}`}>
            {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-allow" /> : <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-deny" />}
            {c.t}
          </motion.li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">“30” isn’t in the cited text, so that claim is removed.</p>
    </Card>
  );
}

function SourceCard() {
  return (
    <Card>
      <Label>Citations</Label>
      <h3 className="font-brand mt-2 text-2xl font-semibold text-ink">Land on the exact sentence.</h3>
      <div className="mt-5 rounded-xl border border-line bg-white p-4 shadow-sm">
        <p className="text-[11px] font-semibold text-ink">Acme Corp Leave Policy · page 1</p>
        <div className="mt-2 space-y-1.5">
          <span className="block h-1.5 w-11/12 rounded bg-surface-hover" />
          <motion.span initial={{ backgroundSize: "0% 100%" }} whileInView={{ backgroundSize: "100% 100%" }} viewport={{ once: true }}
            transition={{ duration: 1.1, delay: 0.3 }}
            className="block rounded bg-[linear-gradient(rgba(252,211,77,0.65),rgba(252,211,77,0.65))] bg-no-repeat px-1 py-0.5 text-[11px] text-ink">
            Full-time employees receive 24 days of paid annual leave per year.
          </motion.span>
          <span className="block h-1.5 w-9/12 rounded bg-surface-hover" />
          <span className="block h-1.5 w-10/12 rounded bg-surface-hover" />
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><Quote className="h-3.5 w-3.5" /> Highlight drawn from the page itself.</p>
    </Card>
  );
}

function RevokeCard() {
  return (
    <Card className="lg:col-span-2">
      <div className="grid items-center gap-6 sm:grid-cols-[1fr_1fr]">
        <div>
          <Label>Revocation</Label>
          <h3 className="font-brand mt-2 text-2xl font-semibold text-ink">Lose access, lose the old answers.</h3>
          <p className="mt-1.5 text-sm text-ink-light">Reopen an old conversation and each answer is re-checked against what you can read today.</p>
        </div>
        <div className="space-y-2">
          <div className="rounded-xl border border-line bg-surface-subtle p-3 text-sm text-muted">
            <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-deny"><EyeOff className="h-3.5 w-3.5" /> Withdrawn</span>
            This answer used sources you can no longer access.
          </div>
          <div className="rounded-xl border border-allow-border bg-allow-bg/60 p-3 text-sm text-ink">
            <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-allow"><ShieldCheck className="h-3.5 w-3.5" /> Still valid</span>
            Full-time employees receive 24 days of paid leave.
          </div>
        </div>
      </div>
    </Card>
  );
}

export function Capabilities() {
  return (
    <section id="capabilities" className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-28">
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">Capabilities</p>
        <h2 className="font-brand mt-4 text-4xl font-semibold leading-[1.05] text-ink sm:text-5xl">Built for answers you can defend.</h2>
      </div>
      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        <OcrCard />
        <ClaimsCard />
        <SourceCard />
        <RevokeCard />
      </div>
    </section>
  );
}

/** Closing call to action, on paper rather than a dark block. */
export function GetStarted() {
  return (
    <section id="get-started" className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
      <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
        className="paper-card paper-grain relative overflow-hidden rounded-[32px] px-6 py-14 text-center sm:px-12">
        <div aria-hidden className="absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />
        <motion.div initial={{ rotate: -14, scale: 1.3, opacity: 0 }} whileInView={{ rotate: -4, scale: 1, opacity: 1 }} viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.2 }} className="relative mx-auto w-fit">
          <LogoMark className="h-16 w-24" />
        </motion.div>
        <h2 className="font-brand relative mx-auto mt-6 max-w-2xl text-4xl font-semibold leading-[1.05] text-ink sm:text-5xl">
          Pick a persona and try to see what you shouldn’t.
        </h2>
        <p className="relative mx-auto mt-4 max-w-lg text-ink-light">Six people, one company, different clearances. Ask the same questions and compare.</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/signin" className="group btn-primary inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm">
            Open the demo <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link to="/register" className="inline-flex items-center rounded-2xl border border-line bg-surface px-6 py-3.5 text-sm font-semibold text-ink hover:border-accent/40">
            Register a workspace
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
