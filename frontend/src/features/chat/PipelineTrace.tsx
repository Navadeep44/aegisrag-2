import { motion } from "framer-motion";
import { Calculator, Fingerprint, Lock, Search, ShieldCheck, ShieldX, Sparkles, type LucideIcon } from "lucide-react";
import type { TraceStep } from "../../lib/types";

const STEP: Record<string, { icon: LucideIcon; tint: string; title: string }> = {
  identity: { icon: Fingerprint, tint: "text-sky-700 border-sky-500/30 bg-sky-500/10", title: "Identity" },
  guard: { icon: ShieldX, tint: "text-deny border-deny/30 bg-deny/10", title: "Guard" },
  authz: { icon: Lock, tint: "text-accent border-accent/30 bg-accent/10", title: "SQL ACL" },
  retrieve: { icon: Search, tint: "text-teal-700 border-teal-500/30 bg-teal-500/10", title: "Retrieve" },
  analytics: { icon: Calculator, tint: "text-emerald-700 border-emerald-500/30 bg-emerald-500/10", title: "Compute" },
  generate: { icon: Sparkles, tint: "text-ai border-ai/30 bg-ai/10", title: "Generate" },
  verify: { icon: ShieldCheck, tint: "text-allow border-allow/30 bg-allow/10", title: "Verify" },
};

function facts(s: TraceStep): string[] {
  const d = s as Record<string, unknown>;
  switch (s.key) {
    case "identity": return [String(d.clearance ?? ""), ...((d.roles as string[]) ?? []).slice(0, 2)];
    case "authz": return [
      `${d.documents_authorized} docs`, `${d.chunks_authorized} chunks in scope`,
      ...(d.chunks_withheld !== undefined ? [`${d.chunks_withheld} withheld`] : []),
    ];
    case "retrieve": return [`${d.hits} hits`, `${d.vector_candidates ?? 0} dense · ${d.keyword_candidates ?? 0} BM25`];
    case "analytics": return [`${d.rows_matched}/${d.rows_authorized} rows`];
    case "generate": return [String(d.model ?? ""), `${d.evidence_blocks} blocks`];
    case "verify": return [`${d.verified ?? 0} verified`, `${d.removed ?? 0} removed`];
    default: return [];
  }
}

export function PipelineTrace({ steps, totalMs }: { steps: TraceStep[]; totalMs?: number }) {
  const sql = steps.find((s) => s.key === "analytics")?.explain as string | undefined;
  return (
    <div className="rounded-2xl border border-line bg-surface-subtle/50 p-3">
      <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
        {steps.map((s, i) => {
          const meta = STEP[s.key] ?? STEP.identity;
          const Icon = meta.icon;
          return (
            <motion.div key={s.key + i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }} className="flex items-center gap-1.5">
              <div className="min-w-[118px] rounded-xl border border-line bg-surface px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className={`grid h-6 w-6 place-items-center rounded-lg border ${meta.tint}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="font-mono text-[10px] text-muted">{s.ms}ms</span>
                </div>
                <p className="mt-1.5 text-[11px] font-bold text-ink">{meta.title}</p>
                {facts(s).filter(Boolean).map((f) => (
                  <p key={f} className="truncate text-[10px] text-muted">{f}</p>
                ))}
              </div>
              {i < steps.length - 1 && <span className="h-px w-3 shrink-0 bg-gradient-to-r from-accent/60 to-ai/60" />}
            </motion.div>
          );
        })}
      </div>
      {sql && (
        <p className="mt-2 truncate rounded-lg border border-line bg-surface-subtle px-2.5 py-1.5 font-mono text-[11px] text-emerald-700">
          {sql}
        </p>
      )}
      {totalMs !== undefined && <p className="mt-1.5 text-right font-mono text-[10px] text-muted-light">{totalMs} ms end-to-end</p>}
    </div>
  );
}
