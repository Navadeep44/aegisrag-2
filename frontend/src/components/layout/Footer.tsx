import { LogIn, Lock, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../brand/Logo";

export function Footer() {
  return (
    <footer className="relative border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-5 py-10">
        <div className="space-y-2">
          <Logo size="sm" />
          <p className="text-xs text-muted">PS-01 · Secure multi-modal RAG with access control. Demo data is fictional.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="chip"><Lock className="h-3 w-3 text-accent" /> Deny by default</span>
          <span className="chip"><ShieldCheck className="h-3 w-3 text-allow" /> Cited or silent</span>
          <Link to="/signin" className="chip hover:text-accent"><LogIn className="h-3 w-3" /> Sign in</Link>
        </div>
      </div>
    </footer>
  );
}
