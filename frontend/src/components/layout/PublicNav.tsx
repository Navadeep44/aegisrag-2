import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Logo } from "../brand/Logo";

const LINKS = [
  { href: "#pipeline", label: "How it works" },
  { href: "#same-question", label: "Access" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#get-started", label: "Demo" },
];

/** Full-width bar at the top of the page that tightens into a floating pill once you scroll. */
export function PublicNav() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
      <motion.div
        animate={{
          maxWidth: scrolled ? 1040 : 1280,
          paddingTop: scrolled ? 8 : 12,
          paddingBottom: scrolled ? 8 : 12,
        }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className={`mx-auto flex items-center justify-between gap-4 rounded-2xl px-4 transition-colors duration-300 sm:px-5 ${
          scrolled ? "border border-line/80 bg-surface/85 shadow-[0_12px_30px_-18px_rgba(60,45,20,0.35)] backdrop-blur-xl" : "border border-transparent"
        }`}
      >
        <Link to="/" aria-label="Eyes Only home"><Logo /></Link>

        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}
              className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-ink-light transition-colors hover:bg-surface-hover hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <Link to="/register" className="rounded-xl px-3.5 py-2 text-[13px] font-semibold text-ink-light hover:text-accent">
            New workspace
          </Link>
          <Link to={user ? "/app/ask" : "/signin"}
            className="group btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px]">
            {user ? "Open console" : "Try the demo"}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <button onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}
          className="rounded-lg p-2 text-ink sm:hidden">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.nav initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="paper-card mx-auto mt-2 grid max-w-md gap-1 rounded-2xl p-2 sm:hidden">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm font-semibold text-ink hover:bg-surface-hover">{l.label}</a>
            ))}
            <Link to={user ? "/app/ask" : "/signin"} className="btn-primary mt-1 rounded-xl px-3 py-2.5 text-center text-sm">
              {user ? "Open console" : "Try the demo"}
            </Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
