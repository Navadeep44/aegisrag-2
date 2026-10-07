import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { Copy, Check, FileText, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import type { Citation, Message } from "../../lib/types";
import { LEVELS } from "../../lib/types";

interface MessageBubbleProps {
  message: Message;
  selected: Citation | null;
  onSelect: (c: Citation) => void;
  onRequestAccess?: (resource: { id: string; title: string }) => void;
}

export function MessageBubble({
  message,
  selected,
  onSelect,
  onRequestAccess,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const reduce = useReducedMotion();

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // User Message
  if (message.role === "user") {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="ml-auto w-fit max-w-xl rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-xs"
      >
        <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
      </motion.div>
    );
  }

  // Assistant Message
  const answered = message.status === "answered";
  const isBriefing = message.content.includes("### 📋 Strategic Executive Briefing") || message.content.includes("Executive Summary");

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-3xl space-y-3"
    >
      <div
        className={`rounded-2xl border p-5 sm:p-6 shadow-xs transition-all ${
          answered
            ? isBriefing
              ? "border-accent/30 bg-accent-light/40"
              : "border-line bg-surface"
            : "border-dashed border-amber-300 bg-amber-50/50"
        }`}
      >
        {/* Abstention or Friendly Notice Header */}
        {!answered && (
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-800">
              <AlertCircle className="h-3.5 w-3.5" />
            </span>
            <p className="font-semibold text-ink text-xs uppercase tracking-wider font-mono">
              {message.status === "redacted"
                ? "Answer Withdrawn (Access Grant Revoked)"
                : "No Authorized Documents Found"}
            </p>
          </div>
        )}

        {/* Message Content */}
        <div className="text-sm sm:text-[0.95rem] text-ink leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>

        {/* Suggested Resource Card (When Abstaining) */}
        {!answered && message.suggested_resource && (
          <div className="mt-4 rounded-xl border border-line bg-surface p-4 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-ink">
                  Relevant information exists in: <span className="text-accent">{message.suggested_resource.title}</span>
                </p>
                <p className="text-[0.7rem] text-muted mt-0.5">
                  Classification: {LEVELS[message.suggested_resource.classification] || "Confidential"} • Requires grant
                </p>
              </div>

              {onRequestAccess && (
                <button
                  type="button"
                  onClick={() =>
                    onRequestAccess({
                      id: message.suggested_resource!.id,
                      title: message.suggested_resource!.title,
                    })
                  }
                  className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-ink/90 transition-colors flex items-center gap-1"
                >
                  <span>Request access</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer info bar on answered questions */}
        {answered && (
          <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-[0.7rem] text-muted">
            <div className="flex items-center gap-1.5 font-mono text-emerald-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Grounded in verified sources</span>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-muted hover:text-ink transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Verified Citations Badges */}
      {message.citations.length > 0 && (
        <div className="space-y-2 pt-1 pl-1">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted font-mono">
            Sources — click to inspect exact page scan:
          </p>
          <div className="flex flex-wrap gap-2">
            {message.citations.map((c, idx) => {
              const active = selected?.chunk_id === c.chunk_id;
              return (
                <button
                  key={c.chunk_id}
                  onClick={() => onSelect(c)}
                  aria-pressed={active}
                  className={`group flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                    active
                      ? "border-ink bg-ink text-white shadow-xs"
                      : "border-line bg-surface text-ink hover:border-ink/60 hover:bg-surface-subtle"
                  }`}
                >
                  <FileText className={`h-3.5 w-3.5 ${active ? "text-white" : "text-muted group-hover:text-ink"}`} />
                  <span className="font-medium">{c.title}</span>
                  <span className={`text-[0.7rem] font-mono ${active ? "text-white/80" : "text-muted"}`}>
                    p.{c.page}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
