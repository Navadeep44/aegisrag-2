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
    { path: "ask", label: "Ask AI", icon: Sparkles },
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

  return (
    <ToastProvider>
      <LenisProvider scrollerRef={mainRef}>
        <div className="flex h-screen w-full overflow-hidden bg-page text-ink font-sans">
          {/* Mobile Top App Bar (<1024px) */}
          <div className="lg:hidden fixed top-0 left-0 right-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Toggle Navigation"
                className="rounded-lg p-1.5 text-muted hover:bg-surface-hover hover:text-ink shrink-0"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <Link to="/app/dashboard" className="flex items-center gap-2 min-w-0">
                {user.tenant_logo ? (
                  <img
                    src={user.tenant_logo}
                    alt={user.tenant || "Logo"}
                    className="h-6 w-6 rounded-md object-contain shrink-0"
                  />
                ) : (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink text-white font-mono text-[0.65rem] font-bold">
                    {(user.tenant || "HQ").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="display text-base font-semibold tracking-tight text-ink truncate">
                  {user.tenant || "Enterprise Workspace"}
                </span>
              </Link>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <ClearancePill clearance={user.clearance} label={user.clearance_label} />
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white font-medium text-xs shadow-xs"
              >
                {initials}
              </button>
            </div>
          </div>

          {/* Backdrop for Mobile Drawer */}
          {mobileOpen && (
            <div
              className="lg:hidden fixed inset-0 z-40 bg-ink/40 backdrop-blur-xs"
              onClick={() => setMobileOpen(false)}
            />
          )}

          {/* Sidebar (Desktop 260px, Tablet Icon Rail 72px / Collapsible, Mobile Drawer) */}
          <aside
            aria-label="Main Navigation"
            className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-surface transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
              mobileOpen ? "translate-x-0 w-72 shadow-2xl" : "-translate-x-full lg:w-64"
            }`}
          >
            {/* Sidebar Brand Header */}
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
              <Link to="/app/dashboard" className="flex items-center gap-2.5 min-w-0">
                {user.tenant_logo ? (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-subtle border border-line p-1 shadow-xs overflow-hidden">
                    <img
                      src={user.tenant_logo}
                      alt={user.tenant || "Company Logo"}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-ink text-white font-bold text-xs shadow-xs">
                    {(user.tenant || "HQ").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="display text-sm font-bold tracking-tight text-ink block leading-tight truncate">
                    {user.tenant || "Enterprise Workspace"}
                  </span>
                  <span className="text-[0.65rem] font-mono text-muted uppercase tracking-wider block mt-0.5 truncate">
                    {user.tenant_category ? `${user.tenant_category} Workspace` : "Verified Portal"}
                  </span>
                </div>
              </Link>

              {/* Close Button on Mobile Drawer */}
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="lg:hidden rounded-lg p-1 text-muted hover:bg-surface-hover hover:text-ink shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation Groups List */}
            <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4 space-y-6">
              {navGroups.map((group, gIdx) => (
                <div key={gIdx} className="space-y-1">
                  {group.label && (
                    <p className="px-3 text-[0.65rem] font-bold uppercase tracking-wider text-muted font-mono mb-2">
                      {group.label}
                    </p>
                  )}
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <li key={item.path}>
                          <NavLink
                            to={`/app/${item.path}`}
                            className={({ isActive }) =>
                              `group relative flex items-center justify-between rounded-lg px-3 py-2 text-xs sm:text-sm transition-colors duration-150 ${
                                isActive
                                  ? "font-medium text-ink bg-surface-subtle shadow-xs"
                                  : "text-muted hover:bg-surface-hover/70 hover:text-ink"
                              }`
                            }
                          >
                            {({ isActive }) => (
                              <>
                                {/* Left Animated Active Pill Bar */}
                                {isActive && (
                                  <motion.span
                                    layoutId="sidebar-active-indicator"
                                    className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-md bg-ink"
                                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                                  />
                                )}

                                <div className="flex items-center gap-3 min-w-0">
                                  <Icon
                                    className={`h-4.5 w-4.5 shrink-0 transition-colors ${
                                      isActive ? "text-ink" : "text-muted group-hover:text-ink"
                                    }`}
                                  />
                                  <span className="truncate">{item.label}</span>
                                </div>

                                {item.badge !== undefined && (
                                  <span className="rounded-full bg-warn-bg text-warn border border-warn-border px-1.5 py-0.2 text-[0.7rem] font-semibold font-mono">
                                    {item.badge}
                                  </span>
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

            {/* Bottom User Profile Section */}
            <div className="shrink-0 border-t border-line bg-surface-subtle/40 p-3">
              <div className="relative">
                {/* Popover Menu for Switch Persona / Sign Out */}
                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-line bg-surface p-2 shadow-lg space-y-1"
                    >
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate("/app/profile");
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-ink hover:bg-surface-hover transition-colors text-left"
                      >
                        <UserIcon className="h-4 w-4 text-muted" />
                        <span>My Profile & Clearances</span>
                      </button>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          signOut();
                          navigate("/signin");
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-deny hover:bg-deny-bg transition-colors text-left"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Switch Persona / Sign out</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* User Card Trigger */}
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex w-full items-center justify-between rounded-lg p-2 hover:bg-surface-hover transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-white font-medium text-xs shadow-xs">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-ink truncate leading-tight">{user.name}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="text-[0.65rem] text-muted truncate font-mono">{primaryRole}</span>
                        <span className="text-[0.65rem] text-muted">•</span>
                        <span className="text-[0.65rem] text-muted font-mono">{user.clearance_label}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-muted shrink-0 transition-transform ${
                      userMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </div>
            </div>
          </aside>

          {/* Main Content Area with Scroll Progress */}
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden pt-14 lg:pt-0">
            {/* Top Page Scroll Progress Bar */}
            <div
              className="absolute top-0 left-0 right-0 z-20 h-0.5 bg-transparent"
              aria-hidden="true"
            >
              <div
                className="h-full bg-accent transition-all duration-75"
                style={{ width: `${scrollProgress}%` }}
              />
            </div>

            {/* Scrollable Container with Lenis scroller */}
            <main
              ref={mainRef}
              className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8 lg:px-12"
            >
              <div className="mx-auto max-w-6xl w-full">
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
