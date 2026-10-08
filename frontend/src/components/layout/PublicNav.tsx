import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ButtonLink } from "../ui/Button";
import { Shield } from "lucide-react";
import { useEffect } from "react";

export function PublicNav() {
  const { user } = useAuth();
  
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      document.documentElement.style.scrollBehavior = '';
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-page/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
        <Link to="/" className="display flex items-center gap-2 text-2xl text-ink">
          <Shield className="h-6 w-6 text-accent" />
          AegisRAG
        </Link>
        <nav aria-label="Sections" className="ml-auto hidden items-center gap-7 text-sm text-muted sm:flex">
          <a href="#same-question" className="hover:text-ink transition-colors">The idea</a>
          <a href="#how-it-works" className="hover:text-ink transition-colors">How it works</a>
          <a href="#checks" className="hover:text-ink transition-colors">What is tested</a>
          <Link to="/register" className="font-semibold text-accent hover:underline">Register Company</Link>
        </nav>
        <div className="ml-auto sm:ml-0 flex items-center gap-2.5">
          <Link
            to="/register"
            className="hidden sm:inline-flex rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:border-ink transition-colors"
          >
            Start Company SaaS
          </Link>
          <ButtonLink to={user ? "/app/dashboard" : "/signin"}>
            {user ? "Open the app" : "Sign in"}
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
