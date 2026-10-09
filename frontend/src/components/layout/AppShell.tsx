import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useOutlet } from "react-router-dom";
import {
  LayoutDashboard,
  Sparkles,
  FileText,
  KeyRound,
  Users,
  Building2,
  Settings,
  SlidersHorizontal,
  ShieldCheck,
  Cpu,
  User as UserIcon,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ShieldAlert,
  Globe,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { ClearancePill, RolePill } from "../ui/StatusPill";
import { LenisProvider, useLenisContext } from "../motion/LenisProvider";
import { ToastProvider } from "../ui/Toast";
import { PageTransition } from "../motion/PageTransition";
import { Logo } from "../brand/Logo";

interface NavItem {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number | string;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const mainRef = useRef<HTMLElement>(null);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  // Load pending access requests count for badge
  useEffect(() => {
    if (!user) return;
    api<{ pending_requests_count?: number; my_requests_count?: number }>("/dashboard/stats")
      .then((data) => {
        const count = data.pending_requests_count ?? 0;
        setPendingRequestsCount(count);
      })
      .catch(() => {});
  }, [user, location.pathname]);

  // Track scroll progress for top progress indicator
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight) {
        setScrollProgress(0);
      } else {
        setScrollProgress((scrollTop / (scrollHeight - clientHeight)) * 100);
      }
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

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

  // Navigation Groups Definition (Clean & Role-Aware)
  const navGroups: NavGroup[] = [];

  // Group 1: Workspace
  const workspaceItems: NavItem[] = [
    { path: "dashboard", label: "Home", icon: LayoutDashboard },
    { path: "ask", label: "Ask Aegis", icon: Sparkles },
    { path: "documents", label: "Documents", icon: FileText },
  ];
  navGroups.push({ label: "Workspace", items: workspaceItems });

  // Group 2: Management (Role-Gated)
  const managementItems: NavItem[] = [];
  if (isAdmin || isIamAdmin || isOwner || perms.has("role.manage")) {
    managementItems.push({ path: "roles-hub", label: "Role Portals", icon: Globe });
  }
  if (isAdmin || isIamAdmin || isOwner || isHr || perms.has("user.invite") || perms.has("role.manage")) {
    managementItems.push({ path: "users-and-roles", label: "Team & Roles", icon: Users });
  }
  managementItems.push({
    path: "access-requests",
    label: "Access Requests",
    icon: KeyRound,
    badge: pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
  });
  if (isAdmin || isIamAdmin || isOwner || isDeptManager || isTeamLead) {
    managementItems.push({ path: "department-insights", label: "Departments", icon: Building2 });
  }
  if (managementItems.length > 0) {
    navGroups.push({ label: "Management", items: managementItems });
  }

  // Group 3: System & Security (Role-Gated)
  const systemItems: NavItem[] = [];
  if (isAdmin || isOwner || isPlatformAdmin) {
    systemItems.push({ path: "settings", label: "Settings", icon: Settings });
  }
  if (isAdmin || isAuditor || isPlatformAdmin || perms.has("audit.read")) {
    systemItems.push({ path: "security", label: "Security & Audit", icon: ShieldCheck });
  }
  if (isAdmin || isIamAdmin || perms.has("policy.simulate")) {
    systemItems.push({ path: "simulator", label: "Simulator", icon: SlidersHorizontal });
  }
  if (isPlatformAdmin) {
    systemItems.push({ path: "platform", label: "Platform Ops", icon: Cpu });
  }
  if (systemItems.length > 0) {
    navGroups.push({ label: "System", items: systemItems });
  }

  // Get user initials
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const primaryRole = roles[0] || "employee";

  const tone = ["from-level-0 to-level-0/40", "from-level-1 to-accent", "from-level-2 to-amber-500", "from-level-3 to-rose-500"][user.clearance] || "from-accent to-ai";

  const sidebar = (
    <>
      <div className="flex h-16 shrink-0 items-center justify-between px-5">
        <Link to="/app/dashboard"><Logo size="sm" /></Link>
        <button type="button" onClick={() => setMobileOpen(false)}
          className="rounded-lg p-1 text-muted hover:bg-surface-hover hover:text-ink lg:hidden">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mx-3 mb-2 flex items-center gap-2.5 rounded-xl border border-line bg-surface-subtle/60 px-3 py-2">
        {user.tenant_logo ? (
          <img src={user.tenant_logo} alt="" className="h-7 w-7 rounded-lg object-contain" />
        ) : (
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-ai/40 to-accent/30 text-[10px] font-bold text-ink">
            {(user.tenant || "HQ").slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-ink">{user.tenant || "Workspace"}</p>
          <p className="flex items-center gap-1 text-[10px] text-allow"><span className="h-1.5 w-1.5 rounded-full bg-allow" /> Isolated tenant</p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {navGroups.map((group, gIdx) => (
          <div key={gIdx}>
            {group.label && (
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-light">{group.label}</p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.path}>
                    <NavLink to={`/app/${item.path}`}
                      className={({ isActive }) =>
                        `group relative flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                          isActive ? "text-ink" : "text-muted hover:bg-surface-hover/60 hover:text-ink"}`}>
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <motion.span layoutId="nav-active"
                              className="absolute inset-0 rounded-xl border border-accent/25 bg-gradient-to-r from-accent/15 to-transparent"
                              transition={{ type: "spring", stiffness: 450, damping: 35 }} />
                          )}
                          <span className="relative flex min-w-0 items-center gap-3">
                            <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-accent" : "text-muted-light group-hover:text-ink-light"}`} strokeWidth={1.9} />
                            <span className="truncate font-medium">{item.label}</span>
                          </span>
                          {item.badge !== undefined && (
                            <span className="relative rounded-full bg-warn/15 px-1.5 text-[11px] font-bold text-warn">{item.badge}</span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <div className="relative">
          <AnimatePresence>
            {userMenuOpen && (
              <motion.div initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }} transition={{ duration: 0.15 }}
                className="glass absolute bottom-full left-0 right-0 mb-2 space-y-1 rounded-xl p-1.5 shadow-lg">
                <button onClick={() => { setUserMenuOpen(false); navigate("/app/profile"); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-surface-hover">
                  <UserIcon className="h-4 w-4 text-muted" /> Profile
                </button>
                <button onClick={() => { setUserMenuOpen(false); signOut(); navigate("/signin"); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-deny hover:bg-deny-bg">
                  <LogOut className="h-4 w-4" /> Switch persona
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <button type="button" onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex w-full items-center justify-between gap-2 rounded-xl p-2 text-left hover:bg-surface-hover">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br p-[2px] ${tone}`}>
                <span className="grid h-full w-full place-items-center rounded-full bg-surface text-xs font-bold text-ink">{initials}</span>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{user.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <ClearancePill clearance={user.clearance} label={user.clearance_label} />
                </span>
              </span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <ToastProvider>
      <LenisProvider scrollerRef={mainRef}>
        <div className="flex h-screen w-full overflow-hidden text-ink">
          {/* Mobile top bar */}
          <div className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-page/80 px-4 backdrop-blur-xl lg:hidden">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation"
                className="rounded-lg p-1.5 text-muted hover:bg-surface-hover hover:text-ink">
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <Link to="/app/dashboard"><Logo size="sm" /></Link>
            </div>
            <ClearancePill clearance={user.clearance} label={user.clearance_label} />
          </div>

          {mobileOpen && (
            <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
          )}

          <aside aria-label="Main navigation"
            className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface/80 backdrop-blur-xl transition-transform duration-300 lg:static lg:translate-x-0 ${
              mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}>
            {sidebar}
          </aside>

          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden pt-14 lg:pt-0">
            <div className="absolute left-0 right-0 top-0 z-20 h-0.5" aria-hidden="true">
              <div className="h-full bg-gradient-to-r from-accent to-ai transition-all duration-75" style={{ width: `${scrollProgress}%` }} />
            </div>
            <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 lg:px-10">
              <div className="mx-auto w-full max-w-7xl">
                <AnimatePresence mode="wait" initial={false}>
                  <PageTransition key={location.pathname} className="h-full">
                    {outlet}
                  </PageTransition>
                </AnimatePresence>
              </div>
            </main>
          </div>
        </div>
      </LenisProvider>
    </ToastProvider>
  );
}
