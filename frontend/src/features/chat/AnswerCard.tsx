import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  Activity, AlertTriangle, Calculator, CheckCircle2, CircleDashed, EyeOff, Lock, SearchX, ShieldCheck, ShieldX,
} from "lucide-react";
import type { Citation, Claim, Message } from "../../lib/types";
import { kindStyle } from "../../lib/kinds";
import { MarkdownContent } from "./StructuredAnswer";
import { PipelineTrace } from "./PipelineTrace";

const LEVEL_DOT = ["bg-level-0", "bg-level-1", "bg-level-2", "bg-level-3"];

const CLAIM_ICON = {
  verified: { icon: CheckCircle2, cls: "text-allow", label: "Verified against source" },
  computed: { icon: Calculator, cls: "text-emerald-700", label: "Computed exactly from authorized rows" },
  partial: { icon: CircleDashed, cls: "text-warn", label: "Partly supported by source" },
  unsupported: { icon: AlertTriangle, cls: "text-deny", label: "Not supported" },
};

function GroundingRing({ score }: { score: number }) {
  const r = 15, c = 2 * Math.PI * r;
  const color = score >= 0.9 ? "#15803d" : score >= 0.6 ? "#b45309" : "#b91c1c";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="relative grid h-11 w-11 place-items-center"
      title="Share of claims verified against their cited source"
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="#e2d9c6" strokeWidth="3" />
        <motion.circle
          cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score) }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      </svg>
      <span className="font-mono text-[10px] font-bold text-ink">{Math.round(score * 100)}</span>
    </motion.div>
  );
}

function CitationChip({ n, citation, active, onClick }: { n: number; citation?: Citation; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={citation ? `${citation.title} · ${citation.location}` : ""}
      className={`ml-1 inline-grid h-5 min-w-5 place-items-center rounded-md border px-1 align-middle font-mono text-[10px] font-bold transition-colors ${
        active ? "border-accent bg-accent text-white" : "border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"}`}>
      {n}
    </button>
  );
}

function TypewriterText({
  text,
  enabled,
  speed = 18,
  onDone,
  className = "",
}: {
  text: string;
  enabled: boolean;
  speed?: number;
  onDone?: () => void;
  className?: string;
}) {
  const [displayed, setDisplayed] = useState(() => (enabled ? "" : text));
  const [done, setDone] = useState(!enabled);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!enabled || !text) {
      setDisplayed(text);
      setDone(true);
      onDoneRef.current?.();
      return;
    }

    setDisplayed("");
    setDone(false);
    let index = 0;
    let timer: NodeJS.Timeout;

    const tick = () => {
      if (index >= text.length) {
        setDone(true);
        onDoneRef.current?.();
        return;
      }

      const step = text.length > 600 ? 2 : 1;
      index = Math.min(index + step, text.length);
      setDisplayed(text.slice(0, index));

      const char = text[index - 1];
      let delay = speed;
      if (char === "." || char === "!" || char === "?") delay = speed * 3;
      else if (char === "," || char === ";" || char === ":") delay = speed * 1.8;
      else if (char === "\n") delay = speed * 2;

      timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, 80);
    return () => clearTimeout(timer);
  }, [text, enabled, speed]);

  return (
    <span className={className}>
      {displayed}
      {!done && (
        <span className="inline-block h-4 w-1.5 ml-0.5 bg-accent rounded-full animate-cursor-blink align-middle shadow-[0_0_8px_rgba(15,118,110,0.6)]" />
      )}
    </span>
  );
}

function ClaimRow({
  claim,
  index,
  number,
  citations,
  selected,
  onSelect,
  animate = false,
  onDone,
}: {
  claim: Claim;
  index: number;
  number: Map<number, number>;
  citations: Citation[];
  selected: Citation | null;
  onSelect: (c: Citation) => void;
  animate?: boolean;
  onDone?: () => void;
}) {
  const s = CLAIM_ICON[claim.status] ?? CLAIM_ICON.verified;
  const Icon = s.icon;
  const [claimFinished, setClaimFinished] = useState(!animate);

  const handleDone = () => {
    setClaimFinished(true);
    onDone?.();
  };

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.08 }}
      className="group flex gap-3 rounded-xl border border-transparent px-2.5 py-2 hover:border-line hover:bg-surface-subtle/60 transition-colors"
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.cls}`} aria-label={s.label} />
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-ink-light">
        {animate ? (
          <TypewriterText text={claim.text} enabled={animate} speed={16} onDone={handleDone} />
        ) : (
          claim.text
        )}

        {claimFinished && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            {claim.citations.map((cid) => {
              const n = number.get(cid);
              const c = citations.find((x) => x.chunk_id === cid);
              return n && c ? (
                <CitationChip
                  key={cid}
                  n={n}
                  citation={c}
                  active={selected?.chunk_id === cid}
                  onClick={() => onSelect({ ...c, quote: claim.quote_chunk === cid && claim.quote ? claim.quote : c.quote })}
                />
              ) : null;
            })}
          </motion.span>
        )}

        {claimFinished && claim.quote && claim.status !== "computed" && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-1 hidden truncate border-l-2 border-allow/40 pl-2 text-[11px] italic text-muted group-hover:block"
          >
            “{claim.quote}”
          </motion.p>
        )}
      </div>
    </motion.li>
  );
}

export function AnswerCard({
  message,
  selected,
  onSelect,
}: {
  message: Message;
  selected: Citation | null;
  onSelect: (c: Citation) => void;
}) {
  const [showTrace, setShowTrace] = useState(false);
  const [isTyping, setIsTyping] = useState(() => Boolean(message.isNew));
  const [activeClaimIndex, setActiveClaimIndex] = useState(() => (message.isNew ? -1 : 999));
  const meta = message.meta;
  const citations = message.citations ?? [];
  const number = new Map(citations.map((c, i) => [c.chunk_id, i + 1]));

  const fullContent = message.content || meta?.headline || "";
  const isMarkdownContent =
    fullContent.includes("\n") ||
    fullContent.includes("|") ||
    fullContent.startsWith("**Direct Answer") ||
    fullContent.includes("###") ||
    fullContent.length > 250 ||
    !meta ||
    !meta.claims?.length;

  const [displayedText, setDisplayedText] = useState(() => (message.isNew ? "" : fullContent));

  useEffect(() => {
    if (!message.isNew || !fullContent) {
      setDisplayedText(fullContent);
      setIsTyping(false);
      return;
    }

    setDisplayedText("");
    setIsTyping(true);
    let index = 0;
    let timer: NodeJS.Timeout;

    const tick = () => {
      if (index >= fullContent.length) {
        setIsTyping(false);
        return;
      }

      const step = fullContent.length > 800 ? 3 : fullContent.length > 400 ? 2 : 1;
      index = Math.min(index + step, fullContent.length);
      setDisplayedText(fullContent.slice(0, index));

      const char = fullContent[index - 1];
      let delay = 16;
      if (char === "." || char === "!" || char === "?") delay = 45;
      else if (char === "," || char === ";" || char === ":") delay = 30;
      else if (char === "\n") delay = 35;

      timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, 60);
    return () => clearTimeout(timer);
  }, [fullContent, message.isNew]);

  const skipAnimation = () => {
    setIsTyping(false);
    setDisplayedText(fullContent);
    setActiveClaimIndex(999);
  };

  if (message.status === "redacted") {
    return (
      <Shell tone="deny" icon={EyeOff} label="Withdrawn" onClick={skipAnimation}>
        <p className="text-sm text-ink-light">
          {message.isNew && isTyping ? displayedText : message.content}
        </p>
      </Shell>
    );
  }

  if (message.status === "refused") {
    return (
      <Shell tone="deny" icon={ShieldX} label="Blocked" onClick={skipAnimation}>
        <p className="text-sm text-ink-light">
          {message.isNew && isTyping ? displayedText : message.content}
        </p>
        {meta?.trace && !isTyping && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3">
            <PipelineTrace steps={meta.trace.steps} />
          </motion.div>
        )}
      </Shell>
    );
  }

  if (message.status === "abstained") {
    return (
      <Shell tone="warn" icon={SearchX} label="No authorized source" onClick={skipAnimation}>
        <p className="text-sm text-ink-light">
          {message.isNew && isTyping ? displayedText : message.content}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          <Lock className="h-3 w-3" /> Nothing outside your access was searched or shown.
        </p>
        {meta?.trace && (
          <TraceToggle open={showTrace} setOpen={setShowTrace} steps={meta.trace.steps} total={meta.trace.total_ms} />
        )}
      </Shell>
    );
  }

  // Markdown Content (Tables, Direct Answers, Bullet points, or multi-line answers)
  if (isMarkdownContent) {
    const computed = meta?.mode === "analytics";
    return (
      <Shell
        tone={computed ? "computed" : "allow"}
        icon={computed ? Calculator : ShieldCheck}
        label={computed ? "Computed" : "Grounded"}
        right={meta?.grounding && !isTyping ? <GroundingRing score={meta.grounding.score} /> : null}
        onClick={skipAnimation}
      >
        <div className="space-y-3">
          <MarkdownContent text={isTyping ? displayedText : fullContent} isTyping={isTyping} />
        </div>

        {!isTyping && meta?.table && meta.table.rows.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mt-3.5 max-h-80 overflow-auto rounded-xl border border-line shadow-2xs"
          >
            <table className="prose-table">
              <thead>
                <tr>
                  {meta.table.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {meta.table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td key={j}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}

        {!isTyping && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
            <Sources citations={citations} selected={selected} onSelect={onSelect} />
          </motion.div>
        )}

        {!isTyping && meta?.trace && (
          <TraceToggle open={showTrace} setOpen={setShowTrace} steps={meta.trace.steps} total={meta.trace.total_ms} />
        )}
      </Shell>
    );
  }

  const computed = meta.mode === "analytics";
  const headline = meta.headline || meta.claims[0]?.text || "";
  const showClaims = !computed;
  const totalClaims = meta.claims.length;

  const handleHeadlineDone = () => {
    if (showClaims && totalClaims > 0) {
      setActiveClaimIndex(0);
    } else {
      setIsTyping(false);
    }
  };

  const handleClaimDone = (idx: number) => {
    if (idx + 1 < totalClaims) {
      setActiveClaimIndex(idx + 1);
    } else {
      setIsTyping(false);
      setActiveClaimIndex(999);
    }
  };

  return (
    <Shell
      tone={computed ? "computed" : "allow"}
      icon={computed ? Calculator : ShieldCheck}
      label={computed ? "Computed" : "Grounded"}
      right={meta.grounding && !isTyping ? <GroundingRing score={meta.grounding.score} /> : null}
      onClick={skipAnimation}
    >
      <div className="display text-lg leading-snug text-ink sm:text-xl font-semibold">
        {message.isNew && activeClaimIndex === -1 ? (
          <TypewriterText text={headline} enabled={true} speed={20} onDone={handleHeadlineDone} />
        ) : (
          headline
        )}
      </div>

      {showClaims && (
        <ul className="mt-3.5 space-y-1">
          {meta.claims.map((c, i) => {
            const shouldAnimate = message.isNew && activeClaimIndex === i;
            const isVisible = activeClaimIndex >= i;
            if (!isVisible) return null;
            return (
              <ClaimRow
                key={i}
                claim={c}
                index={i}
                number={number}
                citations={citations}
                selected={selected}
                onSelect={onSelect}
                animate={shouldAnimate}
                onDone={() => handleClaimDone(i)}
              />
            );
          })}
        </ul>
      )}

      {!isTyping && meta.table && meta.table.rows.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mt-3.5 max-h-80 overflow-auto rounded-xl border border-line shadow-2xs"
        >
          <table className="prose-table">
            <thead>
              <tr>
                {meta.table.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {meta.table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}

      {!isTyping && computed && meta.claims[0]?.quote && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex items-center gap-2 truncate rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[11px] text-emerald-700"
        >
          <Calculator className="h-3.5 w-3.5 shrink-0" /> {meta.claims[0].quote.replace(/^Computed: /, "")}
        </motion.p>
      )}

      {!isTyping && meta.gaps && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/5 px-2.5 py-1.5 text-xs text-warn"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {meta.gaps}
        </motion.p>
      )}

      {!isTyping && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
          <Sources citations={citations} selected={selected} onSelect={onSelect} />
        </motion.div>
      )}

    </Shell>
  );
}

function TraceToggle({
  open,
  setOpen,
  steps,
  total,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  steps: import("../../lib/types").TraceStep[];
  total: number;
}) {
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-muted hover:bg-surface-hover hover:text-accent transition-colors"
      >
        <Activity className="h-3.5 w-3.5" /> {open ? "Hide" : "Show"} pipeline trace · {total} ms
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden pt-2"
          >
            <PipelineTrace steps={steps} totalMs={total} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Sources({
  citations,
  selected,
  onSelect,
}: {
  citations: Citation[];
  selected: Citation | null;
  onSelect: (c: Citation) => void;
}) {
  if (!citations.length) return null;
  const shown = citations.slice(0, 8);
  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
      {shown.map((c, i) => {
        const k = kindStyle(c.kind, c.location);
        const Icon = k.icon;
        const active = selected?.chunk_id === c.chunk_id;
        return (
          <button
            key={c.chunk_id}
            type="button"
            onClick={() => onSelect(c)}
            className={`group flex max-w-[260px] items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-all ${
              active ? "border-accent/60 bg-accent/10 shadow-xs" : "border-line bg-surface-subtle/60 hover:border-accent/40"
            }`}
          >
            <span className="font-mono text-[10px] font-bold text-accent">{i + 1}</span>
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${k.tint}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-ink">{c.title}</span>
              <span className="flex items-center gap-1 text-[10px] text-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_DOT[c.classification] ?? "bg-muted"}`} />
                <span className="truncate">{c.location || `page ${c.page}`}</span>
              </span>
            </span>
          </button>
        );
      })}
      {citations.length > shown.length && (
        <span className="chip self-center">+{citations.length - shown.length} rows</span>
      )}
    </div>
  );
}

const SHELL_TONES = {
  allow: "text-allow border-allow/30 bg-allow/10",
  computed: "text-emerald-700 border-emerald-500/30 bg-emerald-500/10",
  warn: "text-warn border-warn/30 bg-warn/10",
  deny: "text-deny border-deny/30 bg-deny/10",
};

function Shell({
  tone,
  icon: Icon,
  label,
  right,
  onClick,
  children,
}: {
  tone: keyof typeof SHELL_TONES;
  icon: typeof ShieldCheck;
  label: string;
  right?: React.ReactNode;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      onClick={onClick}
      className="glass relative overflow-hidden rounded-2xl p-4 sm:p-5 cursor-default transition-shadow"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${SHELL_TONES[tone]}`}>
          <Icon className="h-3.5 w-3.5" /> {label}
        </span>
        {right}
      </div>
      {children}
    </motion.div>
  );
}

