import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { inputClass } from "../components/ui/field";
import { Notice } from "../components/ui/Notice";
import { useAuth } from "../context/AuthContext";
import { api, post } from "../lib/api";
import type { DemoUser, Session } from "../lib/types";

export default function SignIn() {
  const { user, ready, signIn } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);

  useEffect(() => {
    api<DemoUser[]>("/auth/demo-users").then(setDemoUsers).catch((e) => setError(e.message));
  }, []);

  if (ready && user) return <Navigate to="/app/ask" replace />;

  async function finish(request: Promise<Session>) {
    setError("");
    try {
      signIn(await request);
      navigate("/app/ask");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-14 px-6 py-12 md:grid-cols-2">
      <section>
        <Link to="/" className="display text-2xl">AegisRAG</Link>
        <h1 className="display mt-10 text-5xl">Sign in</h1>
        <p className="mt-3 max-w-sm leading-relaxed text-muted">
          What you can ask about depends on who you are. Pick a demo account, or use your email and password.
        </p>
        <form className="mt-8 max-w-sm space-y-4" onSubmit={(e) => { e.preventDefault(); finish(post<Session>("/auth/login", { email, password })); }}>
          <label className="block text-sm font-medium">Email
            <input className={`${inputClass} mt-1.5`} type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">Password
            <input className={`${inputClass} mt-1.5`} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit">Sign in</Button>
        </form>
      </section>

      {demoUsers.length > 0 && (
        <section aria-label="Demo accounts">
          <h2 className="display text-3xl">Demo accounts</h2>
          <p className="mt-2 text-sm text-muted">One click signs you in. Available in demo mode only.</p>
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {demoUsers.map((u, i) => (
              <motion.li key={u.email}
                initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                <button onClick={() => finish(post<Session>("/auth/demo-login", { email: u.email }))}
                  className="group flex w-full items-baseline justify-between gap-4 px-1 py-3.5 text-left transition-colors hover:bg-surface">
                  <span>
                    <span className="font-medium group-hover:text-accent">{u.name}</span>
                    <span className="block text-sm text-muted">{u.tenant}</span>
                  </span>
                  <span className="text-sm text-muted">{u.roles.join(", ")}</span>
                </button>
              </motion.li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
