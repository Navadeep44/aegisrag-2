import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/Button";
import { inputClass } from "../components/ui/field";
import { Notice } from "../components/ui/Notice";
import { useAuth } from "../context/AuthContext";
import { MessageBubble } from "../features/chat/MessageBubble";
import { SourcePanel } from "../features/chat/SourcePanel";
import { api, post } from "../lib/api";
import type { ChatReply, ChatSession, Citation, Message } from "../lib/types";

const ROLE_PROMPTS: Record<string, { roleTitle: string; scopeDesc: string; questions: string[] }> = {
  finance: {
    roleTitle: "Financial Intelligence Workspace",
    scopeDesc: "Authorized to query FY2025 Revenue Reports, Scanned Vendor Invoices, and General Policies with Level 2 (Confidential) clearance.",
    questions: [
      "What was our annual revenue in FY2025?",
      "What is the total amount on the Apex Solutions vendor invoice?",
      "What are the payment terms in the scanned invoice?",
      "How much was billed for cloud infrastructure consulting?",
    ],
  },
  hr: {
    roleTitle: "Human Resources Workspace",
    scopeDesc: "Authorized to query Salary Bands 2026, Leave Policies, and Employee Handbooks with Level 3 (Restricted) clearance.",
    questions: [
      "What is the salary band for a Senior Software Engineer (Level 4)?",
      "What is the compensation range for an Engineering Manager (Level 5)?",
      "How many days of annual leave do employees get?",
      "What are the requirements for parental leave?",
    ],
  },
  engineering: {
    roleTitle: "Engineering & Architecture Workspace",
    scopeDesc: "Authorized to query Platform Architecture Overviews, Technical Specs, and Onboarding Guides with Level 2 (Confidential) clearance.",
    questions: [
      "Which three services does the platform run on?",
      "What is the architecture for the Ingestion Pipeline and pre-retrieval SQL filtering?",
      "What database and vector store configurations are supported?",
      "Where are the file storage paths and DPI rendering settings located?",
    ],
  },
  organization_owner: {
    roleTitle: "Executive Intelligence Cockpit",
    scopeDesc: "Authorized to query cross-departmental business intelligence, financial reports, and platform architecture with Level 2 clearance.",
    questions: [
      "Summarize our FY2025 financial and revenue performance",
      "What are the major technology stack components and services?",
      "What is the corporate leave and time-off policy?",
      "What are the key IT onboarding security requirements?",
    ],
  },
  executive: {
    roleTitle: "Executive Strategic Intelligence",
    scopeDesc: "Authorized to query cross-departmental strategic reports, revenue forecasts, and platform architecture with Level 2 clearance.",
    questions: [
      "Summarize our FY2025 financial performance and strategic priorities",
      "What is the platform architecture and database isolation design?",
      "What are the core HR leave policies across employee levels?",
      "Provide a cross-departmental executive synthesis on current operational risks.",
    ],
  },
  department_manager: {
    roleTitle: "Department Leadership Workspace",
    scopeDesc: "Authorized to query department technical specifications, team workflows, and corporate leave policies.",
    questions: [
      "What is the company leave policy for team members?",
      "What are the IT onboarding steps for new team engineers?",
      "Which three services does the platform architecture run on?",
      "How do team members submit access requests for restricted resources?",
    ],
  },
  team_lead: {
    roleTitle: "Team Lead Technical Workspace",
    scopeDesc: "Authorized to query project technical documentation, architecture diagrams, and onboarding resources.",
    questions: [
      "Which three services does the platform run on?",
      "What are the IT onboarding steps for new laptops?",
      "How many days of annual leave do employees get?",
      "What database configurations are supported by the backend?",
    ],
  },
  document_manager: {
    roleTitle: "Knowledge Base Verification Console",
    scopeDesc: "Testing grounded multimodal RAG citations and citation veracity against indexed knowledge.",
    questions: [
      "How many days of annual leave do employees get?",
      "What are the IT onboarding guidelines?",
      "Which three services does the platform run on?",
      "What was our annual revenue in FY2025?",
    ],
  },
  admin: {
    roleTitle: "Tenant Administration Q&A",
    scopeDesc: "Testing enterprise RAG retrieval boundaries, citation grounding, and access matrix enforcement.",
    questions: [
      "How many days of annual leave do employees get?",
      "What are the IT onboarding steps for new laptops?",
      "Which three services does the platform run on?",
      "What was our annual revenue in FY2025?",
    ],
  },
  employee: {
    roleTitle: "Employee Knowledge Assistant",
    scopeDesc: "Authorized to query Public and Internal corporate documents (Leave Policy, IT Onboarding Notes).",
    questions: [
      "How many days of annual leave do employees get?",
      "What are the IT onboarding steps for new laptops?",
      "Who do I contact for IT support and equipment setup?",
      "Can employees carry over unused leave days to the next year?",
    ],
  },
};

export default function Chat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<Citation | null>(null);
  const [activeCategory, setActiveCategory] = useState<"tailored" | "all" | "finance" | "hr" | "engineering">("tailored");
  const [briefingMode, setBriefingMode] = useState(false);

  // In-chat Access Request Modal state
  const [requestResource, setRequestResource] = useState<{ id: string; title: string } | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestNotice, setRequestNotice] = useState("");
  const [requestError, setRequestError] = useState("");

  const bottom = useRef<HTMLDivElement>(null);

  const roles = user?.roles || [];
  const primaryRole =
    roles.find((r) => r === "hr") ||
    roles.find((r) => r === "finance") ||
    roles.find((r) => r === "engineering") ||
    roles.find((r) => r === "executive") ||
    roles.find((r) => r === "organization_owner") ||
    roles.find((r) => r === "department_manager") ||
    roles.find((r) => r === "team_lead") ||
    roles.find((r) => r === "document_manager") ||
    roles.find((r) => r === "admin") ||
    "employee";

  const config = ROLE_PROMPTS[primaryRole] || ROLE_PROMPTS.employee;

  const loadSessions = () => api<ChatSession[]>("/chat/sessions").then(setSessions).catch(() => {});
  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages, busy]);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(""); setBusy(true); setQuestion("");
    setMessages((m) => [...m, { role: "user", content: trimmed, status: "", citations: [] }]);
    try {
      const reply = await post<ChatReply>("/chat/query", {
        question: trimmed,
        conversation_id: conversationId,
        briefing_mode: briefingMode,
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
      }, 1800);
    } catch (err) {
      setRequestError((err as Error).message);
    } finally {
      setRequestSubmitting(false);
    }
  }

  let promptList = config.questions;
  if (activeCategory === "finance") promptList = ROLE_PROMPTS.finance.questions;
  else if (activeCategory === "hr") promptList = ROLE_PROMPTS.hr.questions;
  else if (activeCategory === "engineering") promptList = ROLE_PROMPTS.engineering.questions;
  else if (activeCategory === "all") {
    promptList = [
      ...ROLE_PROMPTS.employee.questions.slice(0, 2),
      ...ROLE_PROMPTS.finance.questions.slice(0, 2),
      ...ROLE_PROMPTS.hr.questions.slice(0, 2),
      ...ROLE_PROMPTS.engineering.questions.slice(0, 2),
    ];
  }

  return (
    <div className="grid h-full gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <section className="flex min-h-0 flex-col">
        {/* Role-tailored workspace banner */}
        <div className="mb-4 rounded-xl border border-line bg-surface p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-accent">{config.roleTitle}</span>
              <p className="mt-0.5 text-xs text-muted leading-relaxed">{config.scopeDesc}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Executive Briefing Mode Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-ink font-medium select-none">
                <input
                  type="checkbox"
                  checked={briefingMode}
                  onChange={(e) => setBriefingMode(e.target.checked)}
                  className="rounded border-line text-accent focus:ring-accent"
                />
                Executive Briefing Mode
              </label>

              <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[0.7rem] font-semibold text-white">
                Clearance: {user?.clearance_label || "Internal"} (L{user?.clearance ?? 1})
              </span>
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <h1 className="display text-3xl">Ask</h1>
          <select
            aria-label="Earlier conversations"
            className={`${inputClass} ml-auto max-w-xs`}
            value={conversationId ?? ""}
            onChange={(e) => open(e.target.value)}
          >
            <option value="">New conversation</option>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4 pr-1">
          {messages.length === 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted font-medium mr-1">Topic:</span>
                <button
                  onClick={() => setActiveCategory("tailored")}
                  className={`rounded-full px-2.5 py-1 transition-colors ${activeCategory === "tailored" ? "bg-ink font-medium text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}
                >
                  Tailored for {user?.name.split(" ")[0] || "You"}
                </button>
                <button
                  onClick={() => setActiveCategory("all")}
                  className={`rounded-full px-2.5 py-1 transition-colors ${activeCategory === "all" ? "bg-ink font-medium text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}
                >
                  All Topics
                </button>
                <button
                  onClick={() => setActiveCategory("hr")}
                  className={`rounded-full px-2.5 py-1 transition-colors ${activeCategory === "hr" ? "bg-ink font-medium text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}
                >
                  HR & Compensation
                </button>
                <button
                  onClick={() => setActiveCategory("finance")}
                  className={`rounded-full px-2.5 py-1 transition-colors ${activeCategory === "finance" ? "bg-ink font-medium text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}
                >
                  Finance & Invoices
                </button>
                <button
                  onClick={() => setActiveCategory("engineering")}
                  className={`rounded-full px-2.5 py-1 transition-colors ${activeCategory === "engineering" ? "bg-ink font-medium text-white" : "border border-line bg-surface text-muted hover:text-ink"}`}
                >
                  Engineering & Tech
                </button>
              </div>

              <div className="rounded-xl border border-line bg-surface p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
                  Recommended Starter Queries (Grounded via Pre-Retrieval SQL ACLs)
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {promptList.map((q) => (
                    <li key={q}>
                      <button
                        onClick={() => ask(q)}
                        className="w-full text-left rounded-lg border border-line bg-white p-3 text-xs text-ink transition-all hover:border-accent hover:shadow-xs"
                      >
                        <span className="font-medium">{q}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              message={m}
              selected={source}
              onSelect={setSource}
              onRequestAccess={(res) => setRequestResource(res)}
            />
          ))}

          {busy && <p className="text-sm text-muted" aria-live="polite">Searching the documents you can read…</p>}
          <div ref={bottom} />
        </div>

        {error && <div className="mb-2"><Notice tone="error">{error}</Notice></div>}
        <form className="flex gap-2 pt-2" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
          <input
            className={inputClass}
            placeholder={briefingMode ? "Ask for a Strategic Executive Briefing across authorized documents..." : "Ask a question about authorized enterprise documents..."}
            aria-label="Question"
            value={question}
            maxLength={2000}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button type="submit" disabled={busy || !question.trim()}>Ask</Button>
        </form>
      </section>

      <aside aria-label="Source" className="min-h-0 overflow-y-auto">
        <h2 className="mb-3 text-sm font-semibold">Source & Citation Inspector</h2>
        <AnimatePresence mode="wait" initial={false}>
          {source ? (
            <motion.div key={source.chunk_id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <SourcePanel citation={source} />
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl border border-line bg-surface p-5 text-sm leading-relaxed text-muted">
              <p className="font-medium text-ink">Strict Evidence Grounding</p>
              <p className="mt-1 text-xs">
                Select a citation badge under any answer to inspect the exact passage chunk, document metadata, classification level, and rendered high-res page image.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* In-Chat Access Request Modal */}
      {requestResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl space-y-4">
            <h3 className="display text-xl font-semibold text-ink">Request Document Access</h3>
            <p className="text-xs text-muted">
              Request access to <strong className="text-ink">{requestResource.title}</strong> for your account ({user?.name}).
            </p>

            {requestNotice && <Notice tone="info">{requestNotice}</Notice>}
            {requestError && <Notice tone="error">{requestError}</Notice>}

            <form onSubmit={submitAccessRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Business Justification *</label>
                <textarea
                  className={`${inputClass} min-h-[90px]`}
                  placeholder="Explain why access to this document is required for your role or project task..."
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  kind="secondary"
                  onClick={() => { setRequestResource(null); setRequestError(""); }}
                  disabled={requestSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={requestSubmitting || !requestReason.trim()}>
                  {requestSubmitting ? "Submitting..." : "Submit Request"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
