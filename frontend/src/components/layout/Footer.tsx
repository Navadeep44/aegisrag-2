import { Shield } from "lucide-react";
import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="relative bg-ink text-muted-light">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent"></div>
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link to="/" className="display flex items-center gap-2 text-2xl text-white">
              <Shield className="h-6 w-6 text-accent-light" />
              AegisRAG
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-light">
              Built for PS-01: secure multi-modal RAG with access control. All companies, people and figures in the demo are fictional.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-white">Product</h4>
            <ul className="mt-4 space-y-3 text-sm">
              <li><a href="#same-question" className="hover:text-white transition-colors">The Idea</a></li>
              <li><a href="#how-it-works" className="hover:text-white transition-colors">How it works</a></li>
              <li><a href="#checks" className="hover:text-white transition-colors">Security Checks</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-white">Company</h4>
            <ul className="mt-4 space-y-3 text-sm">
              <li><Link to="/register" className="hover:text-white transition-colors">Register Company</Link></li>
              <li><Link to="/signin" className="hover:text-white transition-colors">Sign in</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-16 border-t border-white/10 pt-8 text-sm">
          <p>&copy; {new Date().getFullYear()} AegisRAG. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
