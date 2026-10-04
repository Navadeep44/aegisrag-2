export type User = {
  id: string;
  name: string;
  email: string;
  tenant: string;
  tenant_id?: string;
  roles: string[];
  clearance: number;
  clearance_label: string;
  is_admin: boolean;
  is_platform_admin: boolean;
  status: string;
  department_id: string | null;
  department_name?: string;
  permissions: string[];
};

export type Department = {
  id: string;
  name: string;
  member_count?: number;
};

export type Session = { token: string; user: User };

export type DemoUser = {
  email: string;
  name: string;
  tenant: string;
  roles: string[];
  clearance_label?: string;
  department?: string;
};

export type Role = {
  id: string;
  name: string;
  scope?: string;
  is_system?: boolean;
  permission_keys?: string[];
};

export type Grant = {
  id?: number;
  subject_type: "everyone" | "role" | "user" | "department";
  subject_id: string | null;
  label?: string;
  expires_at?: string | null;
};

export type Doc = {
  id: string;
  title: string;
  filename: string;
  kind: string;
  classification: number;
  classification_label: string;
  status: string;
  note: string;
  page_count: number;
  flagged: boolean;
  readable: boolean;
  version?: number;
  checksum?: string | null;
  created_at?: string;
  access?: Grant[];
};

export type DocStatus = {
  document_id: string;
  status: string;
  job_status: string;
  stage: string;
  note: string;
  page_count: number;
  version: number;
  checksum: string | null;
  updated_at: string;
};

export type Citation = {
  chunk_id: number;
  document_id: string;
  title: string;
  page: number;
  location: string;
  kind: string;
  classification: number;
  snippet: string;
};

export type Message = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  status: string;
  citations: Citation[];
};

export type ChatReply = {
  conversation_id: string;
  message_id?: number;
  status: string;
  answer: string;
  citations: Citation[];
};

export type ChatSession = { id: string; title: string; created_at?: string };

export type SimRow = {
  document_id: string;
  title: string;
  classification_label: string;
  reason: string;
};

export type SimResult = {
  user: User;
  matches: { document_id: string; title: string; page: number }[];
  searchable: SimRow[];
  excluded: SimRow[];
};

export type TestResult = {
  id: string;
  title: string;
  group: string;
  outcome: string;
  seconds: number;
};

export type TestReport = {
  ran_at: string | null;
  passed?: number;
  failed?: number;
  tests: TestResult[];
};

export type AuditEvent = {
  id: number;
  time: string;
  user: string;
  actor?: string;
  action: string;
  decision: string;
  correlation_id?: string;
  documents: string[];
  detail?: Record<string, unknown>;
};

export type AccessRequest = {
  id: string;
  requester_id: string;
  requester_name: string;
  target_user_id?: string | null;
  target_user_name?: string | null;
  resource_type: string;
  resource_id: string | null;
  resource_name: string;
  reason: string;
  decision: string;
  approver_id: string | null;
  approver_name: string;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
};

export type TenantInfo = {
  id: string;
  name: string;
  status: string;
  settings?: Record<string, unknown>;
  users_count?: number;
  documents_count?: number;
};

export type TenantUsage = {
  users_count: number;
  documents_count: number;
  queries_count: number;
  total_rendered_pages: number;
};

export type TenantBilling = {
  plan: string;
  billing_cycle: string;
  status: string;
  base_price: number;
  active_seats: number;
  seat_unit_price: number;
  documents_count: number;
  total_pages: number;
  storage_cost: number;
  total_queries: number;
  estimated_monthly_total: number;
  next_invoice_date: string;
  invoices: { id: string; period: string; amount: number; status: string; date: string }[];
};

export type DepartmentInsights = {
  department_id: string;
  department_name: string;
  members_count: number;
  members: { id: string; name: string; email: string; roles: string[]; clearance: number; status: string }[];
  department_documents_count: number;
  total_queries_run: number;
  recent_activities: { id: number; actor: string; action: string; decision: string; time: string }[];
};

export type PlatformSecuritySettings = {
  mfa_enforced: boolean;
  session_timeout_minutes: number;
  max_failed_logins: number;
  password_min_length: number;
  allowed_file_types: string[];
  max_upload_size_mb: number;
  encryption_standard: string;
  tls_version_minimum: string;
  audit_immutable: boolean;
  updated_at?: string;
};

export type PlatformMetrics = {
  total_tenants: number;
  total_users: number;
  total_documents: number;
  total_queries: number;
  ai_provider: string;
  database: Record<string, unknown>;
};

export const LEVELS = ["Public", "Internal", "Confidential", "Restricted"];

export function hasPermission(user: User | null | undefined, perm: string): boolean {
  if (!user) return false;
  return Boolean(user.permissions?.includes(perm) || user.is_admin);
}
