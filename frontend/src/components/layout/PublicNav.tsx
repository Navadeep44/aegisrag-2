import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ButtonLink } from "../ui/Button";

export function PublicNav() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-page/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
        <Link to="/" className="display text-2xl">AegisRAG</Link>
        <nav aria-label="Sections" className="ml-auto hidden items-center gap-7 text-sm text-muted sm:flex">
          <a href="#same-question" className="hover:text-ink">The idea</a>
          <a href="#how-it-works" className="hover:text-ink">How it works</a>
          <a href="#checks" className="hover:text-ink">What is tested</a>
        </nav>
        <ButtonLink to={user ? "/app/ask" : "/signin"} className="ml-auto sm:ml-0">
          {user ? "Open the app" : "Sign in"}
        </ButtonLink>
      </div>
    </header>
  );
}
