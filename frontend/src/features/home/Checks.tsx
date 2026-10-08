import { Reveal } from "../../components/motion/Reveal";
import { ButtonLink } from "../../components/ui/Button";
import { ShieldAlert, Building2, EyeOff, FileQuestion, UserX, Link2Off, ShieldCheck, ArrowRight, CheckCircle2 } from "lucide-react";

const CHECKS = [
  {
    title: "Revoked Access Barrier",
    category: "Lifecycle ACL",
    body: "When user access is revoked, existing answer sessions and document vector candidates are immediately invalidated.",
    icon: <ShieldAlert className="h-5 w-5 text-amber-600" />,
    badge: "Active Revocation",
  },
  {
    title: "Multi-Tenant Isolation",
    category: "Tenant Boundary",
    body: "Organizations operate in completely isolated cryptographic boundaries. No cross-tenant document candidate is ever retrieved.",
    icon: <Building2 className="h-5 w-5 text-indigo-600" />,
    badge: "100% Boundary Isolation",
  },
  {
    title: "Prompt Injection Neutralization",
    category: "Ingestion Defense",
    body: "Hidden adversarial prompt injections embedded in white-on-white text or document metadata are sanitized before indexing.",
    icon: <EyeOff className="h-5 w-5 text-emerald-600" />,
    badge: "Sanitized & Flagged",
  },
  {
    title: "Hallucination & Fake Citations",
    category: "Evidence Grounding",
    body: "Any generated claim that cannot be traced to an authorized pre-retrieval chunk is automatically detected and abstained.",
    icon: <FileQuestion className="h-5 w-5 text-blue-600" />,
    badge: "Strict Citation Check",
  },
  {
    title: "Header / JWT Forgery Defense",
    category: "Identity Gate",
    body: "Client-submitted roles, departments, and clearance headers are ignored. Identity is validated against server database state.",
    icon: <UserX className="h-5 w-5 text-rose-600" />,
    badge: "Server-Side Verified",
  },
  {
    title: "Blind Document ID Probing",
    category: "URL Hardening",
    body: "Probing for non-existent vs unauthorized document IDs returns identical timing and error envelopes, preventing enumeration.",
    icon: <Link2Off className="h-5 w-5 text-slate-700" />,
    badge: "Timing-Safe Envelopes",
  },
];

export function Checks() {
  return (
    <section id="checks" className="border-t border-line bg-page py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        {/* Header */}
        <Reveal>
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>Verifiable Security Suite</span>
            </div>
            <h2 className="display text-[clamp(2.4rem,4.8vw,3.8rem)] text-ink leading-tight">
              Security claims you can run, not just read.
            </h2>
            <p className="text-base sm:text-lg leading-relaxed text-muted">
              AegisRAG ships with an integrated automated attack suite. Every test inspects the actual SQL boundary and context window passed to the model.
            </p>
          </div>
        </Reveal>

        {/* 6-Card Security Grid */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CHECKS.map((check, i) => (
            <Reveal key={check.title} delay={(i % 3) * 0.08}>
              <div className="group flex h-full flex-col justify-between rounded-2xl border border-line bg-surface p-6 shadow-xs transition-all hover:border-accent/40 hover:shadow-md">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-subtle border border-line shadow-2xs group-hover:scale-105 transition-transform">
                      {check.icon}
                    </div>
                    <span className="flex items-center gap-1 rounded-full bg-surface-subtle px-2.5 py-0.5 text-[0.65rem] font-bold font-mono uppercase tracking-wider text-muted border border-line">
                      <CheckCircle2 className="h-3 w-3 text-allow" />
                      {check.badge}
                    </span>
                  </div>

                  <div>
                    <span className="text-[0.68rem] font-bold font-mono uppercase tracking-wider text-accent">
                      {check.category}
                    </span>
                    <h3 className="text-base font-bold text-ink mt-0.5">{check.title}</h3>
                    <p className="mt-2 text-xs sm:text-sm leading-relaxed text-muted">{check.body}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* High-Impact Bottom CTA Banner */}
        <Reveal delay={0.2} className="mt-20 rounded-3xl bg-ink p-8 sm:p-12 text-white shadow-xl relative overflow-hidden">
          {/* Subtle Ambient Radial Glow */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-accent/20 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto space-y-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Instant Multi-Persona Experience</span>
            </span>

            <h3 className="display text-[clamp(2rem,4vw,3.2rem)] font-normal tracking-tight text-white leading-tight">
              Test with 11 distinct enterprise roles in real time.
            </h3>

            <p className="text-sm sm:text-base text-white/70 leading-relaxed max-w-xl">
              Switch between CEO, Finance Director, HR Lead, Engineer, Security Auditor, and Document Manager to experience deterministic clearance boundaries.
            </p>

            <div className="pt-2">
              <ButtonLink
                to="/signin"
                size="lg"
                className="bg-white text-ink hover:bg-slate-100 hover:text-ink px-8 py-3.5 text-base font-semibold shadow-md transition-all flex items-center gap-2 group"
              >
                <span>Launch Interactive Demo</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </ButtonLink>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

