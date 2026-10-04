import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/Button";
import { inputClass } from "../components/ui/field";
import { Notice } from "../components/ui/Notice";
import { MessageBubble } from "../features/chat/MessageBubble";
import { SourcePanel } from "../features/chat/SourcePanel";
import { api, post } from "../lib/api";
import type { ChatReply, ChatSession, Citation, Message } from "../lib/types";

const EXAMPLES = [
  "How many days of annual leave do employees get?",
  "What was our annual revenue?",
  "What is the salary band for a senior engineer?",
  "Which three services does the platform run on?",
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<Citation | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const loadSessions = () => api<ChatSession[]>("/chat/sessions").then(setSessions).catch(() => {});
  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages, busy]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(""); setBusy(true); setQuestion("");
    setMessages((m) => [...m, { role: "user", content: trimmed, status: "", citations: [] }]);
    try {
      const reply = await post<ChatReply>("/chat/query", { question: trimmed, conversation_id: conversationId });
      setConversationId(reply.conversation_id);
      setMessages((m) => [...m, { role: "assistant", content: reply.answer, status: reply.status, citations: reply.citations }]);
      setSource(reply.citations[0] ?? null);
      loadSessions();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    setError("");
    if (!id) { setConversationId(null); setMessages([]); setSource(null); return; }
    try {
      const session = await api<{ id: string; messages: Message[] }>(`/chat/sessions/${id}`);
      setConversationId(session.id); setMessages(session.messages); setSource(null);
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="grid h-full gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <section className="flex min-h-0 flex-col">
        <div className="mb-6 flex items-center gap-3">
          <h1 className="display text-4xl">Ask</h1>
          <select aria-label="Earlier conversations" className={`${inputClass} ml-auto max-w-xs`}
            value={conversationId ?? ""} onChange={(e) => open(e.target.value)}>
            <option value="">New conversation</option>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4 pr-1">
          {messages.length === 0 && (
            <div>
              <p className="text-muted">Ask about anything in the documents you can read. Try one of these:</p>
              <ul className="mt-4 divide-y divide-line border-y border-line">
                {EXAMPLES.map((q) => (
                  <li key={q}>
                    <button onClick={() => ask(q)} className="w-full px-1 py-3 text-left transition-colors hover:bg-surface hover:text-accent">{q}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {messages.map((m, i) => <MessageBubble key={i} message={m} selected={source} onSelect={setSource} />)}
          {busy && <p className="text-sm text-muted" aria-live="polite">Searching the documents you can read…</p>}
          <div ref={bottom} />
        </div>

        {error && <div className="mb-2"><Notice tone="error">{error}</Notice></div>}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
          <input className={inputClass} placeholder="Ask a question" aria-label="Question" value={question}
            maxLength={2000} onChange={(e) => setQuestion(e.target.value)} />
          <Button type="submit" disabled={busy || !question.trim()}>Ask</Button>
        </form>
      </section>

      <aside aria-label="Source" className="min-h-0 overflow-y-auto">
        <h2 className="mb-3 text-sm font-semibold">Source</h2>
        <AnimatePresence mode="wait" initial={false}>
          {source ? (
            <motion.div key={source.chunk_id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <SourcePanel citation={source} />
            </motion.div>
          ) : (
            <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm leading-relaxed text-muted">
              Select a citation under an answer to see the passage and page it came from.
            </motion.p>
          )}
        </AnimatePresence>
      </aside>
    </div>
  );
}
