import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Copy, Check, FileText, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import type { Citation, Message } from "../../lib/types";
import { LEVELS } from "../../lib/types";
import { StructuredAnswer } from "./StructuredAnswer";

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

  // Typewriter animation state for newly received assistant messages
  const [displayedText, setDisplayedText] = useState(() => (message.isNew ? "" : message.content));
  const [isTyping, setIsTyping] = useState(() => Boolean(message.isNew && message.role === "assistant"));

  useEffect(() => {
    if (!message.isNew || message.role !== "assistant" || reduce) {
      setDisplayedText(message.content);
      setIsTyping(false);
      return;
    }

    const fullText = message.content;
    let currentIndex = 0;
    // Step size ensures smooth and snappy typing without making the response feel slow (~0.6 - 1.2s total)
    const stepSize = Math.max(3, Math.ceil(fullText.length / 50));

    const interval = setInterval(() => {
      currentIndex = Math.min(currentIndex + stepSize, fullText.length);
      setDisplayedText(fullText.slice(0, currentIndex));

      if (currentIndex >= fullText.length) {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, 16);

    return () => clearInterval(interval);
  }, [message.content, message.isNew, message.role, reduce]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBubbleClick = () => {
    if (isTyping) {
      setDisplayedText(message.content);
      setIsTyping(false);
    }
  };

  // User Message
  if (message.role === "user") {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="ml-auto w-fit max-w-xl rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xs"
      >
        <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
      </motion.div>
    );
  }

  // Assistant Message
  const answered = message.status === "answered";
  const isBriefing =
    message.content.includes("### 📋 Strategic Executive Briefing") ||
    message.content.includes("Executive Summary");

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      onClick={handleBubbleClick}
      className="max-w-3xl space-y-3 cursor-default"
    >
      <div
        className={`rounded-2xl border p-5 sm:p-6 shadow-xs transition-all ${
          answered
            ? isBriefing
              ? "border-indigo-200 bg-indigo-50/40"
              : "border-slate-200/90 bg-white"
            : "border-dashed border-amber-300 bg-amber-50/50"
        }`}
      >
        {/* Abstention or Friendly Notice Header */}
        {!answered && (
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-800">
              <AlertCircle className="h-3.5 w-3.5" />
            </span>
            <p className="font-semibold text-slate-900 text-xs uppercase tracking-wider font-mono">
              {message.status === "redacted"
                ? "Answer Withdrawn (Access Grant Revoked)"
                : message.suggested_resource
                ? "Access Grant Required (Document Restricted)"
                : "Information Not Found in Authorized Documents"}
            </p>
          </div>
        )}

        {/* Message Content */}
        {answered ? (
          <StructuredAnswer
            content={displayedText}
            citations={message.citations}
            onSelectCitation={onSelect}
            isTyping={isTyping}
          />
        ) : (
          <div className="text-sm sm:text-[0.95rem] text-slate-800 leading-relaxed whitespace-pre-wrap">
            {displayedText}
            {isTyping && (
              <span className="inline-block h-4 w-1.5 ml-1 bg-indigo-600 animate-cursor-blink align-middle rounded-full" />
            )}
          </div>
        )}

        {/* Suggested Resource Card (When Abstaining) */}
        {!answered && message.suggested_resource && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">
                  Relevant information exists in:{" "}
                  <span className="text-indigo-600">{message.suggested_resource.title}</span>
                </p>
                <p className="text-[0.7rem] text-slate-500 mt-0.5">
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
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors flex items-center gap-1"
                >
                  <span>Request access</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer info bar on answered questions */}
        {answered && !isTyping && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[0.7rem] text-slate-500">
            <div className="flex items-center gap-1.5 font-mono text-emerald-800">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Grounded in verified sources</span>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Verified Citations Badges for non-answered/system notices */}
      {!answered && !isTyping && message.citations.length > 0 && (
        <div className="space-y-2 pt-1 pl-1">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 font-mono">
            Sources — click to inspect exact page scan:
          </p>
          <div className="flex flex-wrap gap-2">
            {message.citations.map((c) => {
              const active = selected?.chunk_id === c.chunk_id;
              return (
                <button
                  key={c.chunk_id}
                  onClick={() => onSelect(c)}
                  aria-pressed={active}
                  className={`group flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                      : "border-slate-200 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  <FileText className={`h-3.5 w-3.5 ${active ? "text-white" : "text-slate-400 group-hover:text-slate-900"}`} />
                  <span className="font-medium">{c.title}</span>
                  <span className={`text-[0.7rem] font-mono ${active ? "text-white/80" : "text-slate-500"}`}>
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
