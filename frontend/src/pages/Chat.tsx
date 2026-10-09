import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowUp, Calculator, Database, FileText, Fingerprint, History, Image as ImageIcon, Lock, Plus, ScanLine, Search,
  ShieldCheck, Sparkles, type LucideIcon,
} from "lucide-react";
import { LogoMark } from "../components/brand/Logo";
import { Notice } from "../components/ui/Notice";
import { ClearancePill, RolePill } from "../components/ui/StatusPill";
import { AnswerCard } from "../features/chat/AnswerCard";
import { EvidenceViewer } from "../features/chat/EvidenceViewer";
import { useAuth } from "../context/AuthContext";
import { api, post } from "../lib/api";
import { kindStyle } from "../lib/kinds";
import type { ChatReply, ChatSession, Citation, Doc, Message, PipelineInfo } from "../lib/types";

const LEVEL_DOT = ["bg-level-0", "bg-level-1", "bg-level-2", "bg-level-3"];

type Starter = { q: string; icon: LucideIcon; tag: string };

const STARTERS: Record<string, Starter[]> = {
  finance: [
    { q: "Total expense amount by department", icon: Calculator, tag: "DB rows · exact" },
    { q: "What is the total amount due on the Northwind invoice?", icon: ScanLine, tag: "Scanned PDF · OCR" },
    { q: "What was our annual revenue and which quarter was highest?", icon: FileText, tag: "PDF + table" },
    { q: "How many pending claims are there?", icon: Database, tag: "DB rows" },
  ],
  hr: [
    { q: "What is the salary range for a Senior Engineer?", icon: Database, tag: "Spreadsheet" },
    { q: "How many days of annual leave do employees get?", icon: FileText, tag: "PDF" },
    { q: "List all expense claims", icon: Calculator, tag: "Row-level ACL" },
    { q: "Where do visitors pick up their badges?", icon: ImageIcon, tag: "Photo · OCR" },
  ],
  engineering: [
    { q: "What is on the engineering roadmap for August?", icon: ImageIcon, tag: "Whiteboard photo" },
    { q: "Which three services does the platform run on?", icon: FileText, tag: "PDF" },
    { q: "What is the total amount of approved expense claims?", icon: Calculator, tag: "Row-level ACL" },
    { q: "What was our annual revenue?", icon: Lock, tag: "Restricted → denied" },
  ],
  employee: [
    { q: "How many days of annual leave do employees get?", icon: FileText, tag: "PDF" },
    { q: "Where do visitors pick up their badges and what is the lost badge fee?", icon: ImageIcon, tag: "Photo · OCR" },
    { q: "List all expense claims", icon: Database, tag: "Row-level ACL" },
    { q: "What was our annual revenue?", icon: Lock, tag: "Restricted → denied" },
  ],
};

const THINKING = [
  { icon: Fingerprint, label: "Verifying identity" },
  { icon: Lock, label: "Compiling permission filter into SQL" },
  { icon: Search, label: "Hybrid search over authorized chunks" },
  { icon: Sparkles, label: "Drafting from evidence only" },
  { icon: ShieldCheck, label: "Checking every claim against its source" },
];

function Thinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => Math.min(v + 1, THINKING.length - 1)), 650);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="glass flex items-center gap-4 rounded-2xl p-4" aria-live="polite">
      <div className="relative grid h-10 w-10 place-items-center">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-accent/30" />
        <LogoMark className="relative h-8 w-8" />
      </div>
      <div className="flex flex-1 flex-wrap gap-1.5">
        {THINKING.map((s, idx) => {
          const Icon = s.icon;
          const state = idx < i ? "done" : idx === i ? "now" : "todo";
          return (
            <span key={s.label} title={s.label}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold transition-all ${
                state === "done" ? "border-allow/30 bg-allow/10 text-allow"
                  : state === "now" ? "border-accent/50 bg-accent/15 text-accent" : "border-line text-muted-light"}`}>
              <Icon className="h-3 w-3" />
              <span className={state === "now" ? "" : "hidden sm:inline"}>{state === "now" ? s.label : s.label.split(" ")[0]}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function AccessLens({ docs, info }: { docs: Doc[]; info: PipelineInfo | null }) {
  const readable = docs.filter((d) => d.readable && d.status === "active");
  return (
    <div className="glass flex h-full flex-col gap-4 overflow-y-auto rounded-2xl p-4">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-allow" /> Your search scope
        </p>
        <p className="display text-3xl text-ink">{readable.length}<span className="ml-1 text-sm text-muted">sources</span></p>
        <p className="text-[11px] text-muted">Everything else is filtered out inside the database query.</p>
      </div>
      <div className="space-y-1.5">
        {readable.map((d) => {
          const k = kindStyle(d.kind, d.note);
          const Icon = k.icon;
          return (
            <div key={d.id} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-subtle/50 px-2.5 py-2">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${k.tint}`}><Icon className="h-3.5 w-3.5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-ink">{d.title}</span>
                <span className="text-[10px] text-muted">{k.label}{d.row_policy?.column ? " · row rules" : ""}</span>
              </span>
              <span className={`h-2 w-2 rounded-full ${LEVEL_DOT[d.classification] ?? "bg-muted"}`} title={`Level ${d.classification}`} />
            </div>
          );
        })}
      </div>
      {info && (
        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-line pt-3 text-[10px]">
          <span className="chip justify-center"><Sparkles className="h-3 w-3 text-ai" />{info.chat_model}</span>
          <span className="chip justify-center"><Database className="h-3 w-3 text-accent" />{info.embed_dim}-d vectors</span>
          <span className="chip justify-center"><ScanLine className="h-3 w-3 text-warn" />{info.ocr.join(" + ") || "no OCR"}</span>
          <span className="chip justify-center"><Lock className="h-3 w-3 text-allow" />{info.row_rules} row rules</span>
        </div>
      )}
    </div>
  );
}

export default function Chat() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Citation | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [info, setInfo] = useState<PipelineInfo | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const roles = user?.roles || [];
  const persona = (["finance", "hr", "engineering"].find((r) => roles.includes(r)) ?? "employee") as keyof typeof STARTERS;

  const loadSessions = () => api<ChatSession[]>("/chat/sessions").then(setSessions).catch(() => {});

  useEffect(() => {
    loadSessions();
    api<Doc[]>("/documents").then(setDocs).catch(() => {});
    api<PipelineInfo>("/system/pipeline").then(setInfo).catch(() => {});
  }, []);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !busy && messages.length === 0) {
      setSearchParams({}, { replace: true });
      ask(q);
    }
  }, [searchParams]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError("");
    setBusy(true);
    setQuestion("");
    setMessages((m) => [...m, { role: "user", content: trimmed, status: "", citations: [] }]);
    try {
      const reply = await post<ChatReply>("/chat/query", { question: trimmed, conversation_id: conversationId });
      setConversationId(reply.conversation_id);
      setMessages((m) => [...m, {
        role: "assistant", content: reply.answer, status: reply.status, citations: reply.citations, meta: reply.meta, isNew: true,
      }]);
      if (reply.citations[0]) setSelected(reply.citations[0]);
      loadSessions();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function openSession(id: string | null) {
    setShowHistory(false);
    setError("");
    setSelected(null);
    if (!id) {
      setConversationId(null);
      setMessages([]);
      return;
    }
    try {
      const session = await api<{ id: string; messages: Message[] }>(`/chat/sessions/${id}`);
      setConversationId(session.id);
      setMessages(session.messages);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-4 lg:h-[calc(100vh-3rem)]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-ai/30 bg-gradient-to-br from-ai/25 to-accent/10">
            <Sparkles className="h-5 w-5 text-ai" />
          </div>
          <div>
            <h1 className="display text-xl text-ink">Ask Aegis</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <ClearancePill clearance={user?.clearance ?? 1} label={user?.clearance_label} />
              {roles.slice(0, 2).map((r) => <RolePill key={r} role={r} />)}
            </div>
          </div>
        </div>
        <div className="relative flex items-center gap-2">
          <button onClick={() => setShowHistory(!showHistory)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-subtle px-3 py-2 text-xs font-semibold text-ink-light hover:border-accent/40 hover:text-accent">
            <History className="h-4 w-4" /> History
          </button>
          <button onClick={() => openSession(null)} className="btn-primary inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs">
            <Plus className="h-4 w-4" /> New
          </button>
          <AnimatePresence>
            {showHistory && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className="glass absolute right-0 top-full z-30 mt-2 max-h-80 w-72 overflow-y-auto rounded-2xl p-1.5 shadow-lg">
                {sessions.length === 0 && <p className="p-3 text-xs text-muted">No conversations yet.</p>}
                {sessions.map((s) => (
                  <button key={s.id} onClick={() => openSession(s.id)}
                    className={`block w-full truncate rounded-lg px-3 py-2 text-left text-xs hover:bg-surface-hover ${
                      s.id === conversationId ? "text-accent" : "text-ink-light"}`}>
                    {s.title}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Conversation */}
        <div className="flex min-h-0 flex-col">
          {error && <Notice tone="error" className="mb-3">{error}</Notice>}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {!hasMessages && (
              <div className="flex flex-col items-center pt-6 text-center sm:pt-12">
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="relative mb-5 grid h-24 w-24 place-items-center">
                  <span className="absolute inset-0 rounded-full bg-gradient-to-br from-accent/30 to-ai/30 blur-2xl" />
                  <span className="absolute inset-2 animate-pulse-ring rounded-full border border-accent/40" />
                  <LogoMark className="relative h-16 w-16 animate-float" />
                </motion.div>
                <h2 className="display text-2xl text-ink sm:text-3xl">Ask anything <span className="text-gradient">you're cleared to see</span></h2>
                <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px]">
                  <span className="chip"><Lock className="h-3 w-3 text-accent" /> SQL-level access</span>
                  <span className="chip"><ShieldCheck className="h-3 w-3 text-allow" /> Every claim cited</span>
                  <span className="chip"><Calculator className="h-3 w-3 text-emerald-700" /> Exact math</span>
                </div>
                <div className="mt-8 grid w-full max-w-3xl gap-3 sm:grid-cols-2">
                  {STARTERS[persona].map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <motion.button key={s.q} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}
                        onClick={() => ask(s.q)}
                        className="glass glass-hover group flex items-start gap-3 rounded-2xl p-4 text-left">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold leading-snug text-ink">{s.q}</span>
                          <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wider text-muted">{s.tag}</span>
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md border border-accent/25 bg-gradient-to-br from-accent/20 to-ai/10 px-4 py-2.5 text-sm text-ink">
                    {m.content}
                  </p>
                </motion.div>
              ) : (
                <AnswerCard key={i} message={m} selected={selected} onSelect={setSelected} />
              ),
            )}
            {busy && <Thinking />}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <form onSubmit={(e) => { e.preventDefault(); ask(question); }}
            className="glass mt-3 flex items-end gap-2 rounded-2xl p-2 focus-within:border-accent/50 focus-within:shadow-[0_0_0_4px_rgba(34,211,238,0.08)]">
            <textarea ref={inputRef} rows={1} value={question} maxLength={2000} aria-label="Your question"
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(question); } }}
              placeholder="Ask about policies, scans, photos or records…"
              className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-ink placeholder:text-muted-light focus:outline-none" />
            <button type="submit" disabled={busy || !question.trim()} aria-label="Send question"
              className="btn-primary grid h-11 w-11 shrink-0 place-items-center rounded-xl disabled:opacity-30">
              <ArrowUp className="h-5 w-5" />
            </button>
          </form>
        </div>

        {/* Evidence / scope panel */}
        <div className="hidden min-h-0 xl:block">
          <AnimatePresence mode="wait">
            {selected ? (
              <EvidenceViewer key={selected.chunk_id + (selected.quote ?? "")} citation={selected} onClose={() => setSelected(null)} />
            ) : (
              <AccessLens docs={docs} info={info} />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile evidence sheet */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 p-3 backdrop-blur-sm xl:hidden" onClick={() => setSelected(null)}>
            <div className="ml-auto h-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <EvidenceViewer citation={selected} onClose={() => setSelected(null)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
