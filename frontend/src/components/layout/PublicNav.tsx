import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { Logo } from "../brand/Logo";

export function PublicNav() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-page/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-3">
        <Link to="/"><Logo /></Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 text-[13px] font-semibold text-muted md:flex">
          {[["#pipeline", "Pipeline"], ["#same-question", "Access"], ["#modalities", "Multi-modal"], ["#proof", "Proof"]].map(([href, label]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-1.5 hover:bg-surface-hover hover:text-ink">{label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/register" className="hidden rounded-xl border border-line px-3.5 py-2 text-xs font-semibold text-ink-light hover:border-accent/40 hover:text-accent md:inline-flex">
            New workspace
          </Link>
          <Link to={user ? "/app/ask" : "/signin"} className="btn-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs">
            {user ? "Open console" : "Try the demo"} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
