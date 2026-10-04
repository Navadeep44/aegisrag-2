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
  const [filterRole, setFilterRole] = useState("all");

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

  const roleCategories = [
    { id: "all", label: "All Personas" },
    { id: "admin", label: "Admin & IAM" },
    { id: "operations", label: "Docs & Audit" },
    { id: "teams", label: "Dept & Teams" },
    { id: "specialists", label: "Specialists" },
    { id: "platform", label: "Super Admin" },
  ];

  const filteredUsers = demoUsers.filter((u) => {
    if (filterRole === "all") return true;
    if (filterRole === "platform") return u.roles.includes("platform_super_admin");
    if (filterRole === "admin") return u.roles.some((r) => ["admin", "organization_owner", "iam_admin"].includes(r));
    if (filterRole === "operations") return u.roles.some((r) => ["document_manager", "security_auditor"].includes(r));
    if (filterRole === "teams") return u.roles.some((r) => ["department_manager", "team_lead"].includes(r));
    if (filterRole === "specialists") return u.roles.some((r) => ["hr", "finance", "engineering"].includes(r));
    return true;
  });

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl items-start gap-12 px-6 py-12 lg:grid-cols-[1fr_1.4fr]">
      <section className="sticky top-12">
        <Link to="/" className="display text-2xl tracking-tight">AegisRAG</Link>
        <h1 className="display mt-10 text-5xl">Sign in</h1>
        <p className="mt-3 max-w-sm leading-relaxed text-muted">
          Access is derived from verified server-side identity, roles, and clearance. Experience any of the 11 specification roles below or sign in manually.
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
        <section aria-label="Demo accounts" className="rounded-xl border border-line bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-4">
            <div>
              <h2 className="display text-3xl">Demo Personas (11 Roles)</h2>
              <p className="mt-1 text-sm text-muted">Instant one-click authentication for any role in the spec.</p>
            </div>
            <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">Demo Mode</span>
          </div>

          <div className="my-4 flex flex-wrap gap-1.5">
            {roleCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => setFilterRole(c.id)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${filterRole === c.id ? "bg-ink font-medium text-white" : "border border-line bg-white/70 hover:border-ink"}`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <ul className="divide-y divide-line">
            {filteredUsers.map((u, i) => (
              <motion.li
                key={u.email}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 * i, duration: 0.3 }}
              >
                <button
                  onClick={() => finish(post<Session>("/auth/demo-login", { email: u.email }))}
                  className="group flex w-full items-center justify-between gap-4 py-3.5 text-left transition-colors hover:bg-white/90 rounded-md px-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink group-hover:text-accent">{u.name}</span>
                      <span className="rounded bg-line/80 px-1.5 py-0.5 text-[0.7rem] uppercase tracking-wide text-muted">
                        {u.tenant}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted truncate">
                      {u.email} • Dept: {u.department || "General"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="block text-xs font-medium text-ink">{u.roles.join(", ")}</span>
                    <span className="text-[0.7rem] text-muted">Clearance: {u.clearance_label || "Internal"}</span>
                  </div>
                </button>
              </motion.li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
