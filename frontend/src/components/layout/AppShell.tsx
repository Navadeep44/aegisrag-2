import { AnimatePresence, motion } from "framer-motion";
import { Link, NavLink, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { PageTransition } from "../motion/PageTransition";

export function AppShell() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();
  if (!user) return null;

  const perms = new Set(user.permissions || []);
  const roles = user.roles || [];
  const isAdmin = user.is_admin || roles.includes("admin");
  const isPlatformAdmin = user.is_platform_admin || roles.includes("platform_super_admin");
  const isOwner = roles.includes("organization_owner");
  const isIamAdmin = roles.includes("iam_admin");
  const isDocManager = roles.includes("document_manager");
  const isAuditor = roles.includes("security_auditor");
  const isDeptManager = roles.includes("department_manager");
  const isTeamLead = roles.includes("team_lead");
  const isHr = roles.includes("hr");
  const isFinance = roles.includes("finance");
  const isEngineering = roles.includes("engineering");

  const links: [string, string][] = [];

  if (isPlatformAdmin) {
    links.push(["platform", "Platform Ops"]);
    links.push(["security", "Audit Oversight"]);
    links.push(["profile", "My Profile"]);
  } else if (isOwner && !isAdmin) {
    links.push(["settings", "Organization & Billing"]);
    links.push(["users-and-roles", "Users & Governance"]);
    links.push(["documents", "Documents Catalog"]);
    links.push(["ask", "Ask (Executive)"]);
    links.push(["access-requests", "Access Requests"]);
    links.push(["profile", "My Profile"]);
  } else if (isAdmin) {
    links.push(["ask", "Knowledge Search"]);
    links.push(["documents", "Documents & Ingestion"]);
    links.push(["users-and-roles", "IAM & Roles Builder"]);
    links.push(["access-requests", "Access Approvals"]);
    links.push(["simulator", "Policy Simulator"]);
    links.push(["security", "Audit & Security Suite"]);
    links.push(["department-insights", "Departments"]);
    links.push(["settings", "Tenant Settings"]);
    links.push(["profile", "My Profile"]);
  } else if (isIamAdmin) {
    links.push(["users-and-roles", "Identity & Custom Roles"]);
    links.push(["access-requests", "Access Approvals"]);
    links.push(["department-insights", "Department Directory"]);
    links.push(["ask", "Ask"]);
    links.push(["profile", "My Profile"]);
  } else if (isDocManager) {
    links.push(["documents", "Document Ingestion Hub"]);
    links.push(["access-requests", "Access Approvals"]);
    links.push(["ask", "Ask (Verification)"]);
    links.push(["profile", "My Profile"]);
  } else if (isAuditor) {
    links.push(["security", "Security & Audit Explorer"]);
    links.push(["documents", "Document Metadata"]);
    links.push(["access-requests", "Access Request Audit"]);
    links.push(["profile", "My Profile"]);
  } else if (isDeptManager) {
    links.push(["department-insights", "Department Dashboard"]);
    links.push(["documents", "Department Docs"]);
    links.push(["ask", "Ask"]);
    links.push(["access-requests", "Team Access Requests"]);
    links.push(["profile", "My Profile"]);
  } else if (isTeamLead) {
    links.push(["department-insights", "Team Dashboard"]);
    links.push(["ask", "Ask"]);
    links.push(["documents", "Documents"]);
    links.push(["access-requests", "Delegated Requests"]);
    links.push(["profile", "My Profile"]);
  } else if (isHr) {
    links.push(["users-and-roles", "Employee Lifecycle"]);
    links.push(["documents", "HR Documents & Policies"]);
    links.push(["ask", "Ask (Restricted L3)"]);
    links.push(["access-requests", "Access Requests"]);
    links.push(["profile", "My Profile"]);
  } else if (isFinance) {
    links.push(["ask", "Financial Intelligence Q&A"]);
    links.push(["documents", "Financial Documents"]);
    links.push(["access-requests", "Access Requests"]);
    links.push(["profile", "My Profile"]);
  } else if (isEngineering) {
    links.push(["ask", "Engineering & Architecture Q&A"]);
    links.push(["documents", "Architecture Docs"]);
    links.push(["access-requests", "Access Requests"]);
    links.push(["profile", "My Profile"]);
  } else {
    // Standard employee
    links.push(["ask", "Ask Company AI"]);
    links.push(["documents", "Company Documents"]);
    links.push(["access-requests", "Request Access"]);
    links.push(["profile", "My Profile"]);
  }

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <nav aria-label="Main" className="flex shrink-0 flex-col border-b border-line bg-surface p-5 md:w-64 md:border-b-0 md:border-r">
        <Link to="/" className="display text-2xl tracking-tight">AegisRAG</Link>
        <p className="text-xs text-muted font-medium">{user.tenant || "Global Platform"}</p>
        <ul className="mt-4 flex flex-wrap gap-1 md:mt-6 md:flex-col">
          {links.map(([path, label]) => (
            <li key={path}>
              <NavLink to={`/app/${path}`} className="relative block rounded-md px-3 py-2 text-sm">
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span layoutId="nav-active" className="absolute inset-0 rounded-md bg-ink"
                        transition={{ type: "spring", stiffness: 420, damping: 36 }} />
                    )}
                    <span className={`relative ${isActive ? "font-medium text-white" : "text-ink"}`}>{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t border-line pt-4 text-xs md:mt-auto">
          <p className="font-semibold text-ink text-sm">{user.name}</p>
          <p className="mt-0.5 text-muted">Roles: {user.roles.join(", ")}</p>
          <p className="text-muted">Clearance: {user.clearance_label}</p>
          {user.department_id && <p className="text-muted">Dept: {user.department_id}</p>}
          <button
            className="mt-3 text-xs text-accent underline underline-offset-4 hover:opacity-80 font-medium"
            onClick={() => { signOut(); navigate("/signin"); }}
          >
            Switch Persona / Sign out
          </button>
        </div>
      </nav>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10">
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={location.pathname} className="h-full">{outlet}</PageTransition>
        </AnimatePresence>
      </main>
    </div>
  );
}
