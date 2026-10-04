import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Citation, Message } from "../../lib/types";
import { LEVELS } from "../../lib/types";

type Props = {
  message: Message;
  selected: Citation | null;
  onSelect: (c: Citation) => void;
  onRequestAccess?: (resource: { id: string; title: string }) => void;
};

export function MessageBubble({ message, selected, onSelect, onRequestAccess }: Props) {
  const [copied, setCopied] = useState(false);
  const reduce = useReducedMotion();
  const enter = {
    initial: reduce ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3 },
  } as const;

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (message.role === "user") {
    return (
      <motion.p {...enter} className="ml-auto w-fit max-w-xl rounded-md bg-ink px-3.5 py-2 text-sm text-white">
        {message.content}
      </motion.p>
    );
  }

  const answered = message.status === "answered";
  const isBriefing = message.content.includes("### 📋 Strategic Executive Briefing");

  return (
    <motion.div {...enter} className="max-w-2xl space-y-2">
      <div
        className={`relative rounded-xl border px-5 py-4 leading-relaxed shadow-xs ${
          answered
            ? isBriefing
              ? "border-accent/30 bg-accent/5"
              : "border-line bg-surface"
            : "border-dashed border-muted bg-surface/60 text-muted"
        }`}
      >
        {!answered && (
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            <p className="font-semibold text-ink text-xs uppercase tracking-wider">
              {message.status === "redacted" ? "Answer Withdrawn (Source Grant Revoked)" : "No Authorized Sources Found"}
            </p>
          </div>
        )}

        {/* Content with whitespace formatting */}
        <div className="text-sm text-ink whitespace-pre-wrap leading-relaxed">
          {message.content}
        </div>

        {/* Suggested resource banner if abstained */}
        {!answered && message.suggested_resource && (
          <div className="mt-4 rounded-lg border border-accent/20 bg-accent/5 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-ink">
                  Information may exist in: <strong className="text-accent">{message.suggested_resource.title}</strong>
                </p>
                <p className="text-[0.7rem] text-muted">
                  Classification: {LEVELS[message.suggested_resource.classification] || "Confidential"} • Requires individual or role grant
                </p>
              </div>
              {onRequestAccess ? (
                <button
                  onClick={() => onRequestAccess({
                    id: message.suggested_resource!.id,
                    title: message.suggested_resource!.title,
                  })}
                  className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 transition-opacity"
                >
                  Request Access
                </button>
              ) : (
                <Link
                  to="/app/access-requests"
                  className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 transition-opacity"
                >
                  Request Access
                </Link>
              )}
            </div>
          </div>
        )}

        {!answered && !message.suggested_resource && (
          <div className="mt-3">
            <Link
              to="/app/access-requests"
              className="inline-flex items-center gap-1 text-xs text-accent underline underline-offset-2 hover:opacity-80 font-medium"
            >
              Need access to additional enterprise documents? Submit an Access Request →
            </Link>
          </div>
        )}

        {/* Action bar on answered messages */}
        {answered && (
          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[0.7rem] text-muted">
            <span className="font-mono">Grounded Pre-Retrieval ACL</span>
            <button
              onClick={handleCopy}
              className="text-xs text-muted hover:text-ink font-medium underline underline-offset-2"
            >
              {copied ? "✓ Copied!" : "Copy Answer"}
            </button>
          </div>
        )}
      </div>

      {/* Citations List */}
      {message.citations.length > 0 && (
        <div className="space-y-1">
          <p className="text-[0.7rem] uppercase tracking-wider text-muted font-mono">Verified Citations:</p>
          <ul className="flex flex-wrap gap-2">
            {message.citations.map((c) => {
              const active = selected?.chunk_id === c.chunk_id;
              return (
                <li key={c.chunk_id}>
                  <button
                    onClick={() => onSelect(c)}
                    aria-pressed={active}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      active
                        ? "border-ink bg-ink text-white shadow-xs"
                        : "border-line bg-surface text-ink hover:border-accent hover:text-accent"
                    }`}
                  >
                    📄 {c.title}, {c.location || `page ${c.page}`}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </motion.div>
  );
}
