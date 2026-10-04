export type User = {
  id: string; name: string; email: string; tenant: string; roles: string[];
  clearance: number; clearance_label: string; is_admin: boolean;
};
export type Session = { token: string; user: User };
export type DemoUser = { email: string; name: string; tenant: string; roles: string[] };
export type Role = { id: string; name: string };
export type Grant = { subject_type: "everyone" | "role" | "user"; subject_id: string | null; label?: string };
export type Doc = {
  id: string; title: string; filename: string; kind: string; classification: number;
  classification_label: string; status: string; note: string; page_count: number;
  flagged: boolean; readable: boolean; access?: Grant[];
};
export type Citation = {
  chunk_id: number; document_id: string; title: string; page: number; location: string;
  kind: string; classification: number; snippet: string;
};
export type Message = { role: "user" | "assistant"; content: string; status: string; citations: Citation[] };
export type ChatReply = { conversation_id: string; status: string; answer: string; citations: Citation[] };
export type ChatSession = { id: string; title: string };
export type SimRow = { document_id: string; title: string; classification_label: string; reason: string };
export type SimResult = {
  user: User; matches: { document_id: string; title: string; page: number }[];
  searchable: SimRow[]; excluded: SimRow[];
};
export type TestResult = { id: string; title: string; group: string; outcome: string; seconds: number };
export type TestReport = { ran_at: string | null; passed?: number; failed?: number; tests: TestResult[] };
export type AuditEvent = {
  id: number; time: string; user: string; action: string; decision: string; documents: string[];
};

export const LEVELS = ["Public", "Internal", "Confidential", "Restricted"];
