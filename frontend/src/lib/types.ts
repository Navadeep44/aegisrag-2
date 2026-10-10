export type User = {
  id: string;
  name: string;
  email: string;
  tenant: string;
  tenant_id?: string;
  tenant_slug?: string;
  tenant_logo?: string | null;
  tenant_category?: string;
  tenant_website?: string | null;
  tenant_primary_color?: string;
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
  slug?: string;
  description?: string;
  default_clearance?: number;
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

export type SectionMeta = {
  id?: string;
  section_id?: string;
  heading: string;
  level?: number;
  page: number;
  snippet?: string;
  preview?: string;
  allowed_roles?: string[];
};

export type Doc = {
  id: string;
  title: string;
  filename: string;
  kind: string;
  classification: number;
  classification_label: string;
  status: string;
  stage?: string;
  progress_percent?: number;
  note: string;
  page_count: number;
  flagged: boolean;
  readable: boolean;
  version?: number;
  checksum?: string | null;
  created_at?: string;
  sections_metadata?: SectionMeta[];
  data_schema?: {
    table_name?: string;
    columns: string[];
    row_count?: number;
    total_rows?: number;
    primary_key?: string;
    sample_preview?: Record<string, unknown>[];
  } | null;
  chunk_count?: number;
  access?: Grant[];
  row_policy?: { column: string; subject_type: string; full_access_roles: string[] } | null;
};

export type DocStatus = {
  document_id: string;
  status: string;
  job_status: string;
  stage: string;
  percent?: number;
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
  section_heading?: string;
  snippet: string;
  quote?: string;
};

export type ClaimStatus = "verified" | "partial" | "unsupported" | "computed";

export type Claim = {
  text: string;
  citations: number[];
  status: ClaimStatus;
  support: number;
  quote: string;
  quote_chunk: number | null;
  missing_numbers: string[];
};

export type TraceStep = {
  key: string;
  label: string;
  ms: number;
  [detail: string]: unknown;
};

export type AnswerMeta = {
  mode: "rag" | "analytics" | "guard";
  headline?: string;
  claims: Claim[];
  table?: { columns: string[]; rows: string[][]; citations?: number[] } | null;
  gaps?: string;
  grounding?: { score: number; claims: number; verified: number; partial: number };
  suggested_resource?: { id: string; title: string; classification: number } | null;
  selected_document_ids?: string[] | null;
  trace?: { steps: TraceStep[]; total_ms: number };
};

export type PipelineInfo = {
  provider: string;
  chat_model: string;
  embed_model: string;
  embed_dim: number;
  vector_store: string;
  ocr: string[];
  documents: number;
  chunks: number;
  records: number;
  row_rules: number;
};

export type Message = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  status: string;
  citations: Citation[];
  suggested_resource?: {
    id: string;
    title: string;
    classification: number;
  } | null;
  selected_document_ids?: string[] | null;
  meta?: AnswerMeta | null;
  isNew?: boolean;
};

export type ChatReply = {
  conversation_id: string;
  message_id?: number;
  status: string;
  answer: string;
  citations: Citation[];
  meta?: AnswerMeta | null;
  suggested_resource?: {
    id: string;
    title: string;
    classification: number;
  } | null;
};

export type DashboardStats = {
  scope: "platform" | "tenant";
  tenants_count?: number;
  active_tenants?: number;
  suspended_tenants?: number;
  total_chunks?: number;
  total_documents?: number;
  total_users?: number;
  total_audits?: number;
  tenant_id?: string;
  accessible_documents?: number;
  classification_counts?: {
    public: number;
    internal: number;
    confidential: number;
    restricted: number;
  };
  document_status_counts?: {
    active: number;
    flagged: number;
    processing: number;
    failed: number;
  };
  pending_requests_count?: number;
  my_requests_count?: number;
  total_queries?: number;
  my_queries?: number;
  denials_24h?: number;
  ingestion_jobs?: {
    queued: number;
    processing: number;
    ready: number;
    failed: number;
  };
  department?: {
    id: string;
    name: string;
    members_count: number;
  } | null;
};

export type FlaggedDoc = {
  id: string;
  title: string;
  filename: string;
  classification: number;
  status: string;
  note: string;
  created_at: string;
  sample_chunks: { page: number; text: string }[];
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
  row_access?: { document_id: string; title: string; visible_rows: number; total_rows: number; rule: string }[];
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
  user_email?: string;
  roles?: string[];
  question?: string | null;
  actor?: string;
  action: string;
  decision: string;
  correlation_id?: string;
  documents: string[];
  suggested_resource?: string | null;
  detail?: Record<string, unknown>;
};

export type UnauthorizedQuery = {
  id: number;
  time: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_roles: string[];
  question: string;
  decision: string;
  correlation_id: string;
  suggested_resource: string | null;
  accessible_documents_count: number;
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
  slug?: string;
  industry_category?: string;
  website?: string;
  logo_url?: string;
  primary_color?: string;
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
  department_documents?: { id: string; title: string; classification_label: string; kind: string }[];
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

export type IndustryCategory = {
  id: string;
  name: string;
  badge: string;
  tagline: string;
  description: string;
  icon: string;
  color: string;
  roles: {
    name: string;
    slug: string;
    description: string;
    default_clearance: number;
    permissions?: string[];
  }[];
};

export type RoleHubItem = {
  id: string;
  name: string;
  slug: string;
  description: string;
  default_clearance: number;
  clearance_label: string;
  is_system?: boolean;
  portal_url: string;
  assigned_count: number;
  users: {
    id: string;
    name: string;
    email: string;
    clearance: number;
    clearance_label: string;
    status: string;
    is_admin?: boolean;
  }[];
  permissions: string[];
};

export type PortalInfo = {
  company_id: string;
  company_name: string;
  company_slug: string;
  company_logo?: string | null;
  company_website?: string | null;
  company_category: string;
  company_color: string;
  role_id: string;
  role_name: string;
  role_slug: string;
  role_description: string;
  clearance: number;
  clearance_label: string;
  users_count: number;
};

export function hasPermission(user: User | null | undefined, perm: string): boolean {
  if (!user) return false;
  return Boolean(user.permissions?.includes(perm) || user.is_admin);
}
