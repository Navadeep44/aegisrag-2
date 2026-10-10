import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowUp, Calculator, Check, ChevronDown, Database, FileText, Fingerprint, History, Image as ImageIcon, KeyRound, Lock, Plus, ScanLine, Search,
  ShieldCheck, SlidersHorizontal, Sparkles, X, type LucideIcon,
} from "lucide-react";
import { LogoMark } from "../components/brand/Logo";
import { Notice } from "../components/ui/Notice";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
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
  { icon: Fingerprint, label: "Verifying identity & clearance" },
  { icon: Lock, label: "Compiling SQL permission filters" },
  { icon: Search, label: "Hybrid vector search over authorized chunks" },
  { icon: Sparkles, label: "Synthesizing answer from verified evidence" },
  { icon: ShieldCheck, label: "Grounding and citing verified claims" },
];

function Thinking() {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setStepIdx((v) => (v < THINKING.length - 1 ? v + 1 : v));
    }, 600);
    return () => clearInterval(t);
  }, []);

  const currentStep = THINKING[stepIdx];
  const StepIcon = currentStep.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.3 }}
      className="glass relative overflow-hidden rounded-2xl p-4 sm:p-5 shadow-sm"
      aria-live="polite"
    >
      {/* Top subtle ambient beam */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

      {/* Header with animated logo and current active phase */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-accent/10 border border-accent/25">
            <span className="absolute inset-0 animate-pulse-ring rounded-xl bg-accent/20" />
            <LogoMark className="relative h-6 w-6 text-accent" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-ink font-mono">
                Eyes Only active
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
                Phase {stepIdx + 1} of {THINKING.length}
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              <StepIcon className="h-3.5 w-3.5 text-accent animate-spin-slow" />
              <span className="font-medium text-ink-light transition-all duration-200">
                {currentStep.label}…
              </span>
            </p>
          </div>
        </div>

        {/* Phase Pills */}
        <div className="hidden sm:flex items-center gap-1">
          {THINKING.map((s, idx) => {
            const Icon = s.icon;
            const isDone = idx < stepIdx;
            const isCurrent = idx === stepIdx;
            return (
              <span
                key={s.label}
                title={s.label}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition-all duration-300 ${
                  isDone
                    ? "border border-allow/30 bg-allow/10 text-allow"
                    : isCurrent
                    ? "border border-accent/40 bg-accent/15 text-accent shadow-2xs scale-105"
                    : "border border-line/60 text-muted-light opacity-50"
                }`}
              >
                <Icon className="h-3 w-3" />
                <span className="hidden md:inline">{s.label.split(" ")[0]}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Smooth Shimmering Skeleton Answer Preview */}
      <div className="mt-4 space-y-2.5 pt-2 border-t border-line/60">
        <div className="h-3.5 w-3/4 rounded-full skeleton" />
        <div className="h-3 w-full rounded-full skeleton" />
        <div className="h-3 w-5/6 rounded-full skeleton" />
        <div className="flex items-center gap-2 pt-1">
          <div className="h-2.5 w-24 rounded-full skeleton" />
          <div className="h-2.5 w-16 rounded-full skeleton" />
          <div className="h-2.5 w-32 rounded-full skeleton" />
        </div>
      </div>
    </motion.div>
  );
}

function AccessLens({
  docs,
  info,
  selectedDocIds,
  onToggleDoc,
  onSelectAll,
  onClear,
}: {
  docs: Doc[];
  info: PipelineInfo | null;
  selectedDocIds: string[];
  onToggleDoc: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const readable = docs.filter((d) => d.readable && d.status === "active");
  const isScoped = selectedDocIds.length > 0;

  return (
    <div className="glass flex h-full flex-col gap-4 overflow-y-auto rounded-2xl p-4">
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-allow" /> Your search scope
          </p>
          {readable.length > 0 && (
            <div className="flex items-center gap-1 text-[10px]">
              {isScoped ? (
                <button
                  type="button"
                  onClick={onClear}
                  className="font-medium text-muted hover:text-accent cursor-pointer"
                >
                  Reset all
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="font-medium text-muted hover:text-accent cursor-pointer"
                >
                  Select all
                </button>
              )}
            </div>
          )}
        </div>
        <p className="display text-3xl text-ink">
          {isScoped ? selectedDocIds.length : readable.length}
          <span className="ml-1 text-sm text-muted">
            {isScoped ? `of ${readable.length} sources` : "sources"}
          </span>
        </p>
        <p className="text-[11px] text-muted">
          {isScoped
            ? "Questions are scoped to selected documents only."
            : "Click any document below to scope questions directly."}
        </p>
      </div>

      <div className="space-y-1.5">
        {readable.map((d) => {
          const k = kindStyle(d.kind, d.note);
          const Icon = k.icon;
          const isSelected = selectedDocIds.includes(d.id);
          return (
            <div
              key={d.id}
              onClick={() => onToggleDoc(d.id)}
              className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 cursor-pointer transition-all ${
                isSelected
                  ? "border-accent/60 bg-accent/15 shadow-2xs"
                  : isScoped
                  ? "border-line/60 bg-surface-subtle/30 opacity-60 hover:opacity-100 hover:border-line"
                  : "border-line bg-surface-subtle/50 hover:border-accent/40 hover:bg-surface-subtle"
              }`}
              title={isSelected ? "Selected (click to unselect)" : "Click to scope query to this source"}
            >
              <div
                className={`grid h-4 w-4 place-items-center rounded border transition-colors shrink-0 ${
                  isSelected
                    ? "border-accent bg-accent text-white"
                    : "border-line bg-surface"
                }`}
              >
                {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
              </div>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${k.tint}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-ink">{d.title}</span>
                <span className="text-[10px] text-muted">{k.label}{d.row_policy?.column ? " · row rules" : ""}</span>
              </span>
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${LEVEL_DOT[d.classification] ?? "bg-muted"}`}
                title={`Level ${d.classification}`}
              />
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
  const { showToast } = useToast();
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

  // Document Selection Scope State
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [docFilterText, setDocFilterText] = useState("");

  const readableDocs = docs.filter((d) => d.readable && d.status === "active");
  const filteredReadableDocs = readableDocs.filter(
    (d) =>
      !docFilterText.trim() ||
      d.title.toLowerCase().includes(docFilterText.toLowerCase()) ||
      d.filename.toLowerCase().includes(docFilterText.toLowerCase())
  );

  const toggleDocSelection = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllDocs = () => {
    setSelectedDocIds(readableDocs.map((d) => d.id));
  };

  const clearDocSelection = () => {
    setSelectedDocIds([]);
  };

  // Access Request Modal State
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestAccessResource, setRequestAccessResource] = useState<{ id: string; title: string; classification?: number } | null>(null);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [lastUserQuestion, setLastUserQuestion] = useState("");

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

  const handleOpenRequestAccess = (resource?: { id: string; title: string; classification?: number } | null) => {
    setRequestAccessResource(resource || null);
    if (resource) {
      setSelectedDocId(resource.id);
    } else {
      setSelectedDocId("");
    }
    setRequestReason(lastUserQuestion ? `Access needed to answer question: "${lastUserQuestion}"` : "Access requested for restricted business documents.");
    setShowRequestModal(true);
  };

  const handleSubmitAccessRequest = async () => {
    const targetId = requestAccessResource?.id || selectedDocId;
    if (!targetId) {
      showToast("Please choose a restricted document to request.", "error");
      return;
    }
    if (requestReason.trim().length < 3) {
      showToast("Please provide a business justification.", "error");
      return;
    }
    try {
      setRequestSubmitting(true);
      await post("/access-requests", {
        resource_type: "document",
        resource_id: targetId,
        reason: requestReason.trim(),
      });
      showToast("Access request submitted! Document approvers have been notified.", "success");
      setShowRequestModal(false);
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setRequestSubmitting(false);
    }
  };

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setLastUserQuestion(trimmed);
    setError("");
    setBusy(true);
    setQuestion("");
    const currentScope = selectedDocIds.length > 0 ? [...selectedDocIds] : null;
    setMessages((m) => [
      ...m,
      {
        role: "user",
        content: trimmed,
        status: "",
        citations: [],
        selected_document_ids: currentScope,
      },
    ]);
    try {
      const reply = await post<ChatReply>("/chat/query", {
        question: trimmed,
        conversation_id: conversationId,
        document_ids: currentScope || undefined,
      });
      setConversationId(reply.conversation_id);
      setMessages((m) => [...m, {
        role: "assistant",
        content: reply.answer,
        status: reply.status,
        citations: reply.citations,
        suggested_resource: reply.suggested_resource,
        selected_document_ids: reply.meta?.selected_document_ids || currentScope,
        meta: reply.meta,
        isNew: true,
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
            <h1 className="display text-xl text-ink">Ask Eyes Only</h1>
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
                  <div className="flex flex-col items-end gap-1 max-w-[85%]">
                    <p className="rounded-2xl rounded-br-md border border-accent/25 bg-gradient-to-br from-accent/20 to-ai/10 px-4 py-2.5 text-sm text-ink">
                      {m.content}
                    </p>
                    {m.selected_document_ids && m.selected_document_ids.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-accent px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20">
                        <SlidersHorizontal className="h-2.5 w-2.5" />
                        Scoped to {m.selected_document_ids.length} {m.selected_document_ids.length === 1 ? "document" : "documents"}
                      </span>
                    )}
                  </div>
                </motion.div>
              ) : (
                <AnswerCard
                  key={i}
                  message={m}
                  selected={selected}
                  onSelect={setSelected}
                  onRequestAccess={handleOpenRequestAccess}
                />
              ),
            )}
            {busy && <Thinking />}
            <div ref={bottomRef} />
          </div>

          {/* Document Scope Selector Bar & Composer */}
          <div className="relative mt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 mb-1.5 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowDocPicker(!showDocPicker)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                    selectedDocIds.length > 0
                      ? "border-accent/50 bg-accent/15 text-accent shadow-2xs font-semibold"
                      : "border-line bg-surface-subtle/80 text-ink-light hover:border-accent/40 hover:text-accent"
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-accent" />
                  <span>
                    {selectedDocIds.length === 0
                      ? `Scope: All Documents (${readableDocs.length})`
                      : `Scope: ${selectedDocIds.length} ${selectedDocIds.length === 1 ? "Doc" : "Docs"} Selected`}
                  </span>
                  <ChevronDown className={`h-3 w-3 transition-transform ${showDocPicker ? "rotate-180" : ""}`} />
                </button>

                {selectedDocIds.length > 0 && (
                  <>
                    {/* Selected Doc Badges (up to 3) */}
                    {selectedDocIds.slice(0, 3).map((id) => {
                      const doc = docs.find((d) => d.id === id);
                      if (!doc) return null;
                      const k = kindStyle(doc.kind, doc.note);
                      const Icon = k.icon;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-ink max-w-[200px]"
                          title={doc.title}
                        >
                          <Icon className="h-3 w-3 shrink-0 text-accent" />
                          <span className="truncate">{doc.title}</span>
                          <button
                            type="button"
                            onClick={() => toggleDocSelection(id)}
                            className="text-muted hover:text-deny cursor-pointer ml-0.5"
                            title="Remove from scope"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                    {selectedDocIds.length > 3 && (
                      <span className="rounded-lg bg-surface-subtle border border-line px-1.5 py-0.5 text-[11px] text-muted font-medium">
                        +{selectedDocIds.length - 3} more
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={clearDocSelection}
                      className="text-[11px] text-muted hover:text-deny underline cursor-pointer ml-1"
                    >
                      Reset to All
                    </button>
                  </>
                )}
              </div>

              {selectedDocIds.length > 0 && (
                <span className="text-[10px] text-muted italic hidden sm:inline">
                  Targeted search · {selectedDocIds.length} of {readableDocs.length} sources
                </span>
              )}
            </div>

            {/* Document Picker Dropdown Popover */}
            <AnimatePresence>
              {showDocPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowDocPicker(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className="glass absolute bottom-full left-0 right-0 z-50 mb-2 max-h-[360px] flex flex-col rounded-2xl border border-line p-3 shadow-2xl backdrop-blur-md overflow-hidden"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-line gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-ink flex items-center gap-1.5">
                          <SlidersHorizontal className="h-3.5 w-3.5 text-accent" />
                          Scope Query to Specific Documents
                        </h4>
                        <p className="text-[11px] text-muted">
                          Select documents to restrict retrieval, or clear to search all {readableDocs.length} authorized sources.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={selectAllDocs}
                          className="rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-ink-light hover:border-accent/40 hover:text-accent cursor-pointer"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={clearDocSelection}
                          className="rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-ink-light hover:border-deny/40 hover:text-deny cursor-pointer"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowDocPicker(false)}
                          className="rounded-lg p-1 text-muted hover:bg-surface-hover hover:text-ink cursor-pointer ml-1"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Filter input */}
                    <div className="pt-2 pb-1.5">
                      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-xs">
                        <Search className="h-3.5 w-3.5 text-muted shrink-0" />
                        <input
                          type="text"
                          value={docFilterText}
                          onChange={(e) => setDocFilterText(e.target.value)}
                          placeholder="Search documents by name or filename..."
                          className="w-full bg-transparent text-xs text-ink placeholder:text-muted focus:outline-none"
                        />
                        {docFilterText && (
                          <button type="button" onClick={() => setDocFilterText("")} className="text-muted hover:text-ink">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Scrollable document list */}
                    <div className="space-y-1 overflow-y-auto max-h-[200px] py-1 pr-0.5">
                      {filteredReadableDocs.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted">
                          No authorized documents match "{docFilterText}"
                        </div>
                      ) : (
                        filteredReadableDocs.map((d) => {
                          const isSelected = selectedDocIds.includes(d.id);
                          const k = kindStyle(d.kind, d.note);
                          const Icon = k.icon;
                          return (
                            <div
                              key={d.id}
                              onClick={() => toggleDocSelection(d.id)}
                              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs transition-colors cursor-pointer ${
                                isSelected
                                  ? "border-accent/50 bg-accent/15 text-ink shadow-2xs"
                                  : "border-line/60 bg-surface-subtle/40 text-ink hover:border-line hover:bg-surface-subtle"
                              }`}
                            >
                              <div
                                className={`grid h-4 w-4 place-items-center rounded border transition-colors shrink-0 ${
                                  isSelected
                                    ? "border-accent bg-accent text-white"
                                    : "border-line bg-surface"
                                }`}
                              >
                                {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                              </div>
                              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${k.tint}`}>
                                <Icon className="h-3.5 w-3.5" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate font-semibold text-xs text-ink">{d.title}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-muted">
                                  <span>{k.label}</span>
                                  <span>·</span>
                                  <span className="truncate">{d.filename}</span>
                                  {d.row_policy?.column && <span>· row rules</span>}
                                </div>
                              </div>
                              <span
                                className="rounded px-1.5 py-0.5 text-[9px] font-mono uppercase bg-surface border border-line text-muted shrink-0"
                              >
                                Level {d.classification}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-line text-[11px] text-muted">
                      <span>
                        {selectedDocIds.length === 0
                          ? `All ${readableDocs.length} authorized documents are active in scope`
                          : `${selectedDocIds.length} of ${readableDocs.length} documents selected`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowDocPicker(false)}
                        className="btn-primary px-3 py-1 text-xs rounded-lg"
                      >
                        Done
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            {/* Composer */}
            <form onSubmit={(e) => { e.preventDefault(); ask(question); }}
              className="glass flex items-end gap-2 rounded-2xl p-2 focus-within:border-accent/50 focus-within:shadow-[0_0_0_4px_rgba(34,211,238,0.08)]">
              <textarea ref={inputRef} rows={1} value={question} maxLength={2000} aria-label="Your question"
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(question); } }}
                placeholder={selectedDocIds.length > 0 ? `Ask about the ${selectedDocIds.length} selected document(s)…` : "Ask about policies, scans, photos or records…"}
                className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-ink placeholder:text-muted-light focus:outline-none" />
              <button type="submit" disabled={busy || !question.trim()} aria-label="Send question"
                className="btn-primary grid h-11 w-11 shrink-0 place-items-center rounded-xl disabled:opacity-30">
                <ArrowUp className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>

        {/* Evidence / scope panel */}
        <div className="hidden min-h-0 xl:block">
          <AnimatePresence mode="wait">
            {selected ? (
              <EvidenceViewer key={selected.chunk_id + (selected.quote ?? "")} citation={selected} onClose={() => setSelected(null)} />
            ) : (
              <AccessLens
                docs={docs}
                info={info}
                selectedDocIds={selectedDocIds}
                onToggleDoc={toggleDocSelection}
                onSelectAll={selectAllDocs}
                onClear={clearDocSelection}
              />
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

      {/* Inline Request Access Modal */}
      <AnimatePresence>
        {showRequestModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass w-full max-w-lg rounded-2xl border border-line p-6 shadow-xl space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl border border-accent/30 bg-accent/10 p-2.5 text-accent">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-ink">Request Document Access</h3>
                    <p className="text-xs text-muted">Submit an access authorization request to document approvers</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="rounded-lg p-1 text-muted hover:bg-surface-hover hover:text-ink cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-muted font-medium mb-1">Target Resource</label>
                  {requestAccessResource ? (
                    <div className="rounded-xl border border-line bg-surface-subtle p-3 text-ink font-semibold flex items-center justify-between">
                      <span className="truncate">{requestAccessResource.title}</span>
                      {requestAccessResource.classification !== undefined && (
                        <span className="rounded px-2 py-0.5 bg-line text-[10px] font-mono text-muted uppercase shrink-0">
                          Level {requestAccessResource.classification}
                        </span>
                      )}
                    </div>
                  ) : (
                    <select
                      value={selectedDocId}
                      onChange={(e) => setSelectedDocId(e.target.value)}
                      className="w-full rounded-xl border border-line bg-surface p-2.5 text-xs text-ink focus:outline-accent"
                    >
                      <option value="">Select a restricted document…</option>
                      {docs.filter((d) => !d.readable).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title} (Level {d.classification})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-muted font-medium mb-1">Business Reason / Justification</label>
                  <textarea
                    rows={3}
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                    placeholder="Describe why you need access to this document..."
                    className="w-full rounded-xl border border-line bg-surface p-3 text-xs text-ink focus:outline-accent resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <Button kind="secondary" onClick={() => setShowRequestModal(false)} disabled={requestSubmitting}>
                  Cancel
                </Button>
                <Button
                  kind="primary"
                  disabled={requestSubmitting || (!requestAccessResource && !selectedDocId) || requestReason.trim().length < 3}
                  onClick={handleSubmitAccessRequest}
                >
                  {requestSubmitting ? "Submitting…" : "Submit Access Request"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
