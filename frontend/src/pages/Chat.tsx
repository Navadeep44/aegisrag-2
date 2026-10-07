import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Sparkles,
  ArrowUp,
  History,
  FileText,
  Shield,
  Search,
  CheckCircle2,
  Sliders,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import { Drawer } from "../components/ui/Drawer";
import { ClearancePill } from "../components/ui/StatusPill";
import { MessageBubble } from "../features/chat/MessageBubble";
import { SourcePanel } from "../features/chat/SourcePanel";
import { useAuth } from "../context/AuthContext";
import { api, post } from "../lib/api";
import type { ChatReply, ChatSession, Citation, Message } from "../lib/types";

const ROLE_TOPICS: Record<string, { label: string; questions: string[] }> = {
  finance: {
    label: "Finance & Invoices",
    questions: [
      "What was our annual revenue in FY2025?",
      "What is the total amount on the Apex Solutions vendor invoice?",
      "What are the payment terms in the scanned invoice?",
      "How much was billed for cloud infrastructure consulting?",
    ],
  },
  hr: {
    label: "HR & Compensation",
    questions: [
      "What is the salary band for a Senior Software Engineer (Level 4)?",
      "What is the compensation range for an Engineering Manager (Level 5)?",
      "How many days of annual leave do employees get?",
      "What are the requirements for parental leave?",
    ],
  },
  engineering: {
    label: "Engineering & Architecture",
    questions: [
      "Which three services does the platform run on?",
      "How is database-level access control enforced?",
      "What database and vector store configurations are supported?",
      "Where are file storage paths and DPI rendering settings configured?",
    ],
  },
  employee: {
    label: "Company Knowledge",
    questions: [
      "How many days of annual leave do employees get?",
      "What are the IT onboarding steps for new laptops?",
      "Who do I contact for IT support and equipment setup?",
      "Can employees carry over unused leave days?",
    ],
  },
};

export default function Chat() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [activeCategory, setActiveCategory] = useState<"tailored" | "all" | "finance" | "hr" | "engineering">("tailored");
  const [shortSummary, setShortSummary] = useState(false);

  // In-chat Access Request Drawer state
  const [requestResource, setRequestResource] = useState<{ id: string; title: string } | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestNotice, setRequestNotice] = useState("");
  const [requestError, setRequestError] = useState("");

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const roles = user?.roles || [];
  const primaryRole =
    roles.find((r) => r === "hr") ||
    roles.find((r) => r === "finance") ||
    roles.find((r) => r === "engineering") ||
    "employee";

  const loadSessions = () =>
    api<ChatSession[]>("/chat/sessions")
      .then(setSessions)
      .catch(() => {});

  useEffect(() => {
    loadSessions();
  }, []);

  // Handle URL query param (?q=...)
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !busy && messages.length === 0) {
      setQuestion(q);
      // Remove query param once read
      setSearchParams({}, { replace: true });
      ask(q);
    }
  }, [searchParams]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError("");
    setBusy(true);
    setQuestion("");
    setMessages((m) => [...m, { role: "user", content: trimmed, status: "", citations: [] }]);

    try {
      const reply = await post<ChatReply>("/chat/query", {
        question: trimmed,
        conversation_id: conversationId,
        briefing_mode: shortSummary,
      });

      setConversationId(reply.conversation_id);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: reply.answer,
          status: reply.status,
          citations: reply.citations,
          suggested_resource: reply.suggested_resource,
        },
      ]);
      loadSessions();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openSession(id: string) {
    setError("");
    if (!id) {
      setConversationId(null);
      setMessages([]);
      setSelectedCitation(null);
      return;
    }
    try {
      const session = await api<{ id: string; messages: Message[] }>(`/chat/sessions/${id}`);
      setConversationId(session.id);
      setMessages(session.messages);
      setSelectedCitation(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submitAccessRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!requestResource || !requestReason.trim()) return;
    setRequestSubmitting(true);
    setRequestError("");
    setRequestNotice("");

    try {
      await post("/access-requests", {
        resource_type: "document",
        resource_id: requestResource.id,
        reason: requestReason.trim(),
      });
      setRequestNotice(`Access request submitted for "${requestResource.title}".`);
      setTimeout(() => {
        setRequestResource(null);
        setRequestReason("");
        setRequestNotice("");
      }, 1600);
    } catch (err) {
      setRequestError((err as Error).message);
    } finally {
      setRequestSubmitting(false);
    }
  }

  let promptList = ROLE_TOPICS[primaryRole]?.questions || ROLE_TOPICS.employee.questions;
  if (activeCategory === "finance") promptList = ROLE_TOPICS.finance.questions;
  else if (activeCategory === "hr") promptList = ROLE_TOPICS.hr.questions;
  else if (activeCategory === "engineering") promptList = ROLE_TOPICS.engineering.questions;
  else if (activeCategory === "all") {
    promptList = [
      ...ROLE_TOPICS.employee.questions.slice(0, 2),
      ...ROLE_TOPICS.finance.questions.slice(0, 2),
      ...ROLE_TOPICS.hr.questions.slice(0, 2),
      ...ROLE_TOPICS.engineering.questions.slice(0, 2),
    ];
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col justify-between">
      {/* 1. Slim Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-3">
          <h1 className="display text-2xl font-semibold text-ink">Ask AI</h1>
          <ClearancePill clearance={user?.clearance ?? 1} label={user?.clearance_label} />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Executive Mode / Short Summary Toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none rounded-lg border border-line bg-surface px-2.5 py-1.5 hover:border-ink/60 transition-colors">
            <input
              type="checkbox"
              checked={shortSummary}
              onChange={(e) => setShortSummary(e.target.checked)}
              className="rounded border-line text-ink focus:ring-ink"
            />
            <span className="font-medium text-ink">Short summary</span>
          </label>

          {/* Earlier Conversations Selector */}
          <div className="flex items-center gap-1.5">
            <select
              aria-label="Earlier conversations"
              value={conversationId ?? ""}
              onChange={(e) => openSession(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink focus:border-ink focus:outline-none"
            >
              <option value="">New conversation</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <Notice tone="error" className="my-2">{error}</Notice>}

      {/* 2. Chat Stream / Messages Area */}
      <div className="min-h-0 flex-1 overflow-y-auto py-6 space-y-6">
        {/* Empty State: Hero Input & Starter Chips */}
        {!hasMessages && (
          <div className="mx-auto flex max-w-2xl flex-col items-center justify-center pt-8 sm:pt-16 text-center space-y-6">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-surface border border-line px-3 py-1 text-xs text-muted font-medium shadow-xs">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span>Zero-trust grounded knowledge</span>
              </span>
              <h2 className="display text-4xl sm:text-5xl font-semibold text-ink tracking-tight">
                What would you like to know?
              </h2>
              <p className="text-sm sm:text-base text-muted max-w-md mx-auto">
                Answers cite exact page passages from documents you have permission to read.
              </p>
            </div>

            {/* Topic Filter Pills */}
            <div className="flex flex-wrap justify-center gap-1.5 text-xs pt-2">
              <button
                onClick={() => setActiveCategory("tailored")}
                className={`rounded-full px-3 py-1 transition-all ${
                  activeCategory === "tailored"
                    ? "bg-ink font-medium text-white shadow-xs"
                    : "border border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                Tailored for {user?.name.split(" ")[0] || "You"}
              </button>
              <button
                onClick={() => setActiveCategory("all")}
                className={`rounded-full px-3 py-1 transition-all ${
                  activeCategory === "all"
                    ? "bg-ink font-medium text-white shadow-xs"
                    : "border border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                All Topics
              </button>
              <button
                onClick={() => setActiveCategory("hr")}
                className={`rounded-full px-3 py-1 transition-all ${
                  activeCategory === "hr"
                    ? "bg-ink font-medium text-white shadow-xs"
                    : "border border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                HR & Leave
              </button>
              <button
                onClick={() => setActiveCategory("finance")}
                className={`rounded-full px-3 py-1 transition-all ${
                  activeCategory === "finance"
                    ? "bg-ink font-medium text-white shadow-xs"
                    : "border border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                Finance & Revenue
              </button>
              <button
                onClick={() => setActiveCategory("engineering")}
                className={`rounded-full px-3 py-1 transition-all ${
                  activeCategory === "engineering"
                    ? "bg-ink font-medium text-white shadow-xs"
                    : "border border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                Architecture & Specs
              </button>
            </div>

            {/* Prompt Starter Chips */}
            <div className="w-full grid gap-2.5 sm:grid-cols-2 text-left pt-2">
              {promptList.map((q) => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  className="rounded-xl border border-line bg-surface p-3.5 text-xs text-ink transition-all hover:border-ink/60 hover:bg-surface-subtle hover:shadow-xs"
                >
                  <span className="font-medium leading-relaxed block">"{q}"</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message Bubbles */}
        {hasMessages && (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((m, i) => (
              <MessageBubble
                key={i}
                message={m}
                selected={selectedCitation}
                onSelect={(citation) => setSelectedCitation(citation)}
                onRequestAccess={(res) => setRequestResource(res)}
              />
            ))}

            {busy && (
              <div className="flex items-center gap-2.5 text-xs text-muted font-mono" aria-live="polite">
                <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
                <span>Checking permissions and searching authorized documents…</span>
              </div>
            )}
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* 3. Bottom Chat Input Bar */}
      <div className="border-t border-line pt-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          className="mx-auto max-w-3xl flex items-center gap-2 rounded-2xl border border-line bg-surface p-1.5 shadow-sm focus-within:border-ink focus-within:ring-1 focus-within:ring-ink"
        >
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none"
            placeholder={
              shortSummary
                ? "Ask for a short executive summary across authorized documents..."
                : "Ask a question about authorized enterprise documents..."
            }
            aria-label="Your Question"
            value={question}
            maxLength={2000}
            onChange={(e) => setQuestion(e.target.value)}
          />

          <button
            type="submit"
            disabled={busy || !question.trim()}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
              question.trim() && !busy
                ? "bg-ink text-white hover:bg-ink/90 shadow-xs cursor-pointer"
                : "bg-surface-subtle text-muted cursor-not-allowed"
            }`}
            aria-label="Send question"
          >
            <ArrowUp className="h-4.5 w-4.5" />
          </button>
        </form>
      </div>

      {/* 4. Side Drawer for Source Inspection (Opens on citation click) */}
      <Drawer
        isOpen={Boolean(selectedCitation)}
        onClose={() => setSelectedCitation(null)}
        title="Source Document"
        subtitle="Verified citation grounding from pre-retrieval index"
      >
        {selectedCitation && <SourcePanel citation={selectedCitation} />}
      </Drawer>

      {/* 5. In-Chat Access Request Drawer */}
      <Drawer
        isOpen={Boolean(requestResource)}
        onClose={() => {
          setRequestResource(null);
          setRequestError("");
        }}
        title="Request Document Access"
        subtitle={requestResource ? `Request access to "${requestResource.title}"` : undefined}
      >
        {requestResource && (
          <form onSubmit={submitAccessRequest} className="space-y-4">
            {requestNotice && <Notice tone="info">{requestNotice}</Notice>}
            {requestError && <Notice tone="error">{requestError}</Notice>}

            <div>
              <label className="block text-xs font-medium text-ink mb-1.5">
                Business Justification *
              </label>
              <textarea
                className="w-full rounded-xl border border-line bg-surface p-3 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none min-h-[100px]"
                placeholder="Explain why you need access to this document for your project task..."
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                kind="secondary"
                onClick={() => setRequestResource(null)}
                disabled={requestSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={requestSubmitting || !requestReason.trim()}>
                {requestSubmitting ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  );
}
