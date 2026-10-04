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

  const links = [["ask", "Ask"], ["documents", "Documents"]];
  if (user.is_admin) links.push(["simulator", "Permission simulator"], ["security", "Security"]);

  return (
    <div className="flex h-screen flex-col md:flex-row">
      <nav aria-label="Main" className="flex shrink-0 flex-col border-b border-line bg-surface p-5 md:w-64 md:border-b-0 md:border-r">
        <Link to="/" className="display text-2xl">AegisRAG</Link>
        <p className="text-xs text-muted">{user.tenant}</p>
        <ul className="mt-4 flex flex-wrap gap-1 md:mt-8 md:flex-col">
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
        <div className="mt-4 border-t border-line pt-4 text-sm md:mt-auto">
          <p className="font-medium">{user.name}</p>
          <p className="mt-0.5 text-xs text-muted">Roles: {user.roles.join(", ")}</p>
          <p className="text-xs text-muted">Clearance: {user.clearance_label}</p>
          <button className="mt-3 text-sm text-accent underline underline-offset-4"
            onClick={() => { signOut(); navigate("/signin"); }}>
            Switch user
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
