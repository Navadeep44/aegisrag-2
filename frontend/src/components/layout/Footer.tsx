import { LogIn, Lock, ShieldCheck, Heart, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../brand/Logo";

export function Footer() {
  return (
    <footer className="relative border-t border-line/80 bg-surface/50 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-5 py-10 sm:px-8">
        <div className="space-y-1.5">
          <Logo size="sm" />
          <p className="text-xs text-muted">
            PS-01 · Enterprise Multi-Modal RAG with SQL-Level RBAC & Zero-Leakage Guarantee.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="chip bg-surface">
            <Lock className="h-3 w-3 text-accent" /> Deny by Default
          </span>
          <span className="chip bg-surface">
            <ShieldCheck className="h-3 w-3 text-allow" /> Grounded & Cited
          </span>
          <Link
            to="/signin"
            className="chip bg-surface font-bold text-ink transition-colors hover:border-accent/40 hover:text-accent"
          >
            <LogIn className="h-3 w-3" /> Console Sign In
          </Link>
        </div>
      </div>
    </footer>
  );
}
