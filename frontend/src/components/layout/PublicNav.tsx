import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ButtonLink } from "../ui/Button";
import { Shield, ArrowRight } from "lucide-react";
import { useEffect } from "react";

export function PublicNav() {
  const { user } = useAuth();

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-page/90 backdrop-blur-md transition-all">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3.5">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-ink group">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink text-white group-hover:bg-accent transition-colors shadow-2xs">
            <Shield className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="display text-2xl font-semibold">AegisRAG</span>
        </Link>

        {/* Center Desktop Navigation */}
        <nav aria-label="Page Sections" className="hidden items-center gap-6 text-xs font-semibold text-muted sm:flex">
          <a href="#same-question" className="hover:text-ink transition-colors px-2 py-1 rounded-md hover:bg-surface-subtle">
            The Idea
          </a>
          <a href="#architecture" className="hover:text-ink transition-colors px-2 py-1 rounded-md hover:bg-surface-subtle">
            Architecture
          </a>
          <a href="#how-it-works" className="hover:text-ink transition-colors px-2 py-1 rounded-md hover:bg-surface-subtle">
            How It Works
          </a>
          <a href="#checks" className="hover:text-ink transition-colors px-2 py-1 rounded-md hover:bg-surface-subtle">
            Security Tests
          </a>
        </nav>

        {/* Right CTA Actions */}
        <div className="flex items-center gap-2.5">
          <Link
            to="/register"
            className="hidden md:inline-flex rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:border-ink/60 hover:bg-surface-subtle transition-all shadow-2xs"
          >
            Register Workspace
          </Link>
          <ButtonLink
            to={user ? "/app/dashboard" : "/signin"}
            className="rounded-full px-5 py-2 text-xs font-semibold shadow-xs"
          >
            <span>{user ? "Open App" : "Sign In"}</span>
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}

