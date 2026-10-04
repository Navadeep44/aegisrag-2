import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import type { Citation, Message } from "../../lib/types";

type Props = { message: Message; selected: Citation | null; onSelect: (c: Citation) => void };

export function MessageBubble({ message, selected, onSelect }: Props) {
  const reduce = useReducedMotion();
  const enter = { initial: reduce ? false : { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } } as const;

  if (message.role === "user") {
    return <motion.p {...enter} className="ml-auto w-fit max-w-xl rounded-md bg-ink px-3.5 py-2 text-sm text-white">{message.content}</motion.p>;
  }
  const answered = message.status === "answered";
  return (
    <motion.div {...enter} className="max-w-2xl">
      <div className={`rounded-md border px-4 py-3 leading-relaxed ${answered ? "border-line bg-surface" : "border-dashed border-muted text-muted"}`}>
        {!answered && <p className="font-medium text-ink">{message.status === "redacted" ? "Answer withdrawn (Source revoked)" : "No authorized source"}</p>}
        <p className="text-sm">{message.content}</p>
        {!answered && (
          <Link
            to="/app/access-requests"
            className="mt-2 inline-flex items-center gap-1 text-xs text-accent underline underline-offset-2 hover:opacity-80 font-medium"
          >
            Need access to restricted documents? Submit Access Request →
          </Link>
        )}
      </div>
      {message.citations.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {message.citations.map((c) => {
            const active = selected?.chunk_id === c.chunk_id;
            return (
              <li key={c.chunk_id}>
                <button onClick={() => onSelect(c)} aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${active ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink"}`}>
                  {c.title}, {c.location || `page ${c.page}`}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}
