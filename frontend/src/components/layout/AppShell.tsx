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
  const links: [string, string][] = [];

  if (perms.has("chat.use") || user.is_admin || !user.is_platform_admin) {
    links.push(["ask", "Ask"]);
  }
  if (perms.has("document.metadata.read") || perms.has("document.upload") || user.is_admin) {
    links.push(["documents", "Documents"]);
  }
  if (perms.has("user.read") || perms.has("role.manage") || perms.has("role.assign") || user.is_admin) {
    links.push(["users-and-roles", "Users & Roles"]);
  }
  if (!user.is_platform_admin && (user.roles?.includes("department_manager") || user.roles?.includes("team_lead") || user.department_id || user.is_admin)) {
    links.push(["department-insights", "Dept Insights"]);
  }
  if (!user.is_platform_admin) {
    links.push(["access-requests", "Access Requests"]);
  }
  if (perms.has("policy.simulate") || user.is_admin) {
    links.push(["simulator", "Simulator"]);
  }
  if (perms.has("audit.read") || perms.has("security_tests.read") || user.is_admin) {
    links.push(["security", "Audit & Security"]);
  }
  if (perms.has("tenant.manage") || user.is_admin) {
    links.push(["settings", "Org Settings"]);
  }
  if (user.is_platform_admin || perms.has("platform.tenant.manage")) {
    links.push(["platform", "Platform Ops"]);
  }
  links.push(["profile", "My Profile"]);

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
