import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Menu, X, Shield, Sparkles } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Logo } from "../brand/Logo";

export function PublicNav() {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "#pipeline", label: "Pipeline" },
    { href: "#same-question", label: "Granular Access" },
    { href: "#modalities", label: "Multi-Modal" },
    { href: "#proof", label: "Security Proof" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-page/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-3.5 sm:px-8">
        <Link to="/" className="transition-transform hover:scale-[1.02] active:scale-[0.98]">
          <Logo />
        </Link>

        {/* Desktop Links */}
        <nav aria-label="Sections" className="hidden items-center gap-1.5 text-xs font-bold text-muted md:flex">
          {navLinks.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="rounded-xl px-3.5 py-2 transition-all hover:bg-surface-hover hover:text-ink active:scale-95"
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Action Buttons (Desktop) */}
        <div className="hidden items-center gap-2.5 sm:flex">
          <Link
            to="/register"
            className="rounded-xl border border-line bg-surface/80 px-4 py-2 text-xs font-bold text-ink-light shadow-2xs transition-all hover:border-accent/40 hover:text-accent active:scale-95"
          >
            New Workspace
          </Link>
          <Link
            to={user ? "/app/ask" : "/signin"}
            className="btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold shadow-md transition-all hover:scale-105 active:scale-95"
          >
            <span>{user ? "Open Console" : "Launch Demo"}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex items-center gap-2 sm:hidden">
          <Link
            to={user ? "/app/ask" : "/signin"}
            className="btn-primary inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold"
          >
            <span>{user ? "Console" : "Demo"}</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface text-ink transition-colors hover:bg-surface-hover"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-b border-line bg-surface px-5 py-4 sm:hidden"
          >
            <div className="flex flex-col gap-2">
              {navLinks.map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-xl px-3 py-2 text-sm font-semibold text-ink-light hover:bg-surface-hover hover:text-accent"
                >
                  {label}
                </a>
              ))}
              <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-xl border border-line p-2.5 text-center text-xs font-bold text-ink"
                >
                  New Workspace
                </Link>
                <Link
                  to={user ? "/app/ask" : "/signin"}
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn-primary p-2.5 text-center text-xs font-bold"
                >
                  {user ? "Open Console" : "Launch Demo"}
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
