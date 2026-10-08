import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { inputClass } from "../components/ui/field";
import { Notice } from "../components/ui/Notice";
import { useAuth } from "../context/AuthContext";
import { api, post } from "../lib/api";
import type { DemoUser, Session } from "../lib/types";
import { Shield, Sparkles, ArrowRight, Lock, CheckCircle2, UserCheck } from "lucide-react";
import { ClearancePill, RolePill } from "../components/ui/StatusPill";

export default function SignIn() {
  const { user, ready, signIn } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [filterRole, setFilterRole] = useState("all");
  const [loggingInEmail, setLoggingInEmail] = useState<string | null>(null);

  useEffect(() => {
    api<DemoUser[]>("/auth/demo-users").then(setDemoUsers).catch((e) => setError(e.message));
  }, []);

  if (ready && user) return <Navigate to="/app" replace />;

  async function finish(request: Promise<Session>, emailTarget?: string) {
    setError("");
    if (emailTarget) setLoggingInEmail(emailTarget);
    try {
      signIn(await request);
      navigate("/app");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoggingInEmail(null);
    }
  }

  const roleCategories = [
    { id: "all", label: "All Roles" },
    { id: "admin", label: "Admin & IAM" },
    { id: "operations", label: "Docs & Audit" },
    { id: "teams", label: "Dept & Leads" },
    { id: "specialists", label: "Finance & HR" },
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
    <main className="mx-auto grid min-h-screen max-w-6xl items-start gap-10 px-6 py-12 lg:grid-cols-[1fr_1.4fr]">
      {/* Left Column: Direct Authentication Card */}
      <section className="sticky top-12 space-y-6">
        <Link to="/" className="display flex items-center gap-2 text-2xl text-ink">
          <Shield className="h-6 w-6 text-accent" />
          <span>AegisRAG</span>
        </Link>

        <div className="space-y-2">
          <h1 className="display text-4xl sm:text-5xl font-semibold text-ink">Sign in</h1>
          <p className="text-sm leading-relaxed text-muted">
            Access is enforced cryptographically based on verified server identity, clearance tier, and departmental grants.
          </p>
        </div>

        <form
          className="rounded-2xl border border-line bg-surface p-6 shadow-xs space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            finish(post<Session>("/auth/login", { email, password }));
          }}
        >
          <label className="block text-xs font-semibold text-ink">
            Work Email
            <input
              className={`${inputClass} mt-1.5`}
              type="email"
              required
              autoComplete="username"
              placeholder="e.g. adithya@business.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="block text-xs font-semibold text-ink">
            Password
            <input
              className={`${inputClass} mt-1.5`}
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <Notice tone="error">{error}</Notice>}

          <Button type="submit" className="w-full py-2.5">
            Sign In with Credentials
          </Button>

          <div className="pt-2 border-t border-line text-center text-xs text-muted">
            Setting up a new tenant?{" "}
            <Link to="/register" className="font-semibold text-accent hover:underline">
              Register company workspace →
            </Link>
          </div>
        </form>
      </section>

      {/* Right Column: 1-Click Interactive Persona Switcher */}
      {demoUsers.length > 0 && (
        <section aria-label="Demo accounts" className="rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-xs space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <h2 className="text-lg sm:text-xl font-bold text-ink">1-Click Demo Personas</h2>
              </div>
              <p className="mt-0.5 text-xs text-muted">Instant role simulation to test clearance boundaries</p>
            </div>
            <span className="rounded-full bg-accent-light px-2.5 py-0.5 text-[0.7rem] font-bold font-mono text-accent">
              11 VERIFIED ROLES
            </span>
          </div>

          {/* Segmented Filter Pills */}
          <div className="flex flex-wrap gap-1.5">
            {roleCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => setFilterRole(c.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  filterRole === c.id
                    ? "bg-ink text-white shadow-2xs"
                    : "border border-line bg-surface text-muted hover:border-ink/60 hover:text-ink"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Personas Grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredUsers.map((u, i) => {
              const initials = u.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase();
              const isLoggingIn = loggingInEmail === u.email;

              return (
                <motion.button
                  key={u.email}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.02 * i, duration: 0.2 }}
                  onClick={() => finish(post<Session>("/auth/demo-login", { email: u.email }), u.email)}
                  disabled={Boolean(loggingInEmail)}
                  className="group flex flex-col justify-between rounded-xl border border-line bg-page p-4 text-left transition-all hover:border-accent hover:bg-surface hover:shadow-xs disabled:opacity-60 cursor-pointer"
                >
                  <div className="space-y-2.5 w-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-white font-bold text-xs shadow-2xs group-hover:bg-accent transition-colors">
                          {initials}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ink group-hover:text-accent transition-colors leading-tight truncate">
                            {u.name}
                          </p>
                          <span className="text-[0.65rem] text-muted block truncate font-mono">
                            {u.tenant} • {u.department || "HQ"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="rounded bg-surface px-1.5 py-0.5 text-[0.65rem] font-medium text-ink border border-line truncate max-w-[140px]">
                        {u.roles[0] || "employee"}
                      </span>
                      <span className="rounded bg-accent-light px-1.5 py-0.5 text-[0.65rem] font-semibold text-accent">
                        {u.clearance_label || "Internal"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[0.7rem] text-muted group-hover:text-accent w-full font-medium">
                    <span>{isLoggingIn ? "Authenticating..." : "Click to sign in"}</span>
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </motion.button>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

