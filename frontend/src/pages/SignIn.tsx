import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowRight, Briefcase, Building2, Code2, Crown, Eye, EyeOff, FileCog, Globe2, HeartHandshake, KeyRound, Loader2, Lock, Mail, ScrollText,
  ShieldCheck, User, UserCog, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { Logo } from "../components/brand/Logo";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import { useAuth } from "../context/AuthContext";
import { api, post } from "../lib/api";
import { LEVELS, type DemoUser, type Session } from "../lib/types";

const ROLE_ICON: Record<string, LucideIcon> = {
  admin: UserCog, organization_owner: Crown, iam_admin: KeyRound, document_manager: FileCog,
  security_auditor: ScrollText, department_manager: Building2, team_lead: Users, hr: HeartHandshake,
  finance: Wallet, engineering: Code2, executive: Briefcase, employee: User, platform_super_admin: Globe2,
};
const RING = ["from-level-0 to-slate-300", "from-level-1 to-sky-300", "from-level-2 to-amber-300", "from-level-3 to-rose-300"];
const LEVEL_TEXT = ["text-level-0", "text-level-1", "text-level-2", "text-level-3"];
const LEVEL_NAME = Object.fromEntries(LEVELS.map((l, i) => [l.toLowerCase(), i]));

const FILTERS = [
  { id: "featured", label: "Demo story", icon: ShieldCheck },
  { id: "all", label: "Everyone", icon: Users },
];
const FEATURED = ["employee@acme.test", "finance@acme.test", "engineer@acme.test", "hr@acme.test", "admin@acme.test", "user@globex.test"];

export default function SignIn() {
  const { user, ready, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [filter, setFilter] = useState("featured");
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    api<DemoUser[]>("/auth/demo-users").then(setDemoUsers).catch((e) => setError(e.message));
  }, []);

  if (ready && user) return <Navigate to="/app" replace />;

  async function finish(request: Promise<Session>, target: string) {
    setError("");
    setBusy(target);
    try {
      signIn(await request);
      navigate("/app/ask");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const people = filter === "featured"
    ? FEATURED.map((e) => demoUsers.find((u) => u.email === e)).filter(Boolean) as DemoUser[]
    : demoUsers;

  return (
    <main className="relative min-h-screen">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto max-w-6xl px-5 py-8">
        <div className="flex items-center justify-between">
          <Link to="/"><Logo /></Link>
          <button onClick={() => setShowForm(!showForm)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
              showForm
                ? "border-accent bg-accent/10 text-accent shadow-xs"
                : "border-line bg-surface text-ink-light hover:border-accent/40 hover:text-accent shadow-2xs"
            }`}>
            {showForm ? <Users className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {showForm ? "Demo personas" : "Email sign-in"}
          </button>
        </div>

        <div className="mt-12 text-center">
          <h1 className="display text-4xl text-ink sm:text-5xl">
            {showForm ? "Sign in to your account." : "Pick who you are."}
          </h1>
          <p className="mt-2 text-muted">
            {showForm
              ? "Access your protected organizational documents and workspace."
              : "Each persona sees a different slice of the same company."}
          </p>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="glass mx-auto mt-6 max-w-md rounded-3xl border border-line p-6 sm:p-7 shadow-xl backdrop-blur-md"
            >
              <div className="mb-5 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-accent/10 text-accent">
                  <Mail className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-ink">Account Credentials</h2>
                  <p className="text-xs text-muted">Sign in with your enterprise email</p>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  finish(post<Session>("/auth/login", { email, password }), "form");
                }}
                className="space-y-4"
              >
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink">
                    Email Address <span className="text-deny">*</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-light">
                      <Mail className="h-4 w-4" />
                    </span>
                    <input
                      type="email"
                      required
                      placeholder="e.g. employee@acme.test"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-line bg-surface-subtle pl-10 pr-3.5 py-2.5 text-sm text-ink placeholder:text-muted-light transition-all focus:border-accent/60 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/15"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink">
                    Password <span className="text-deny">*</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-muted-light">
                      <Lock className="h-4 w-4" />
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-line bg-surface-subtle pl-10 pr-10 py-2.5 text-sm text-ink placeholder:text-muted-light transition-all focus:border-accent/60 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-light hover:text-ink transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  size="md"
                  className="w-full mt-2 h-11 text-sm font-semibold shadow-xs"
                  disabled={busy === "form"}
                >
                  {busy === "form" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to Workspace</span>
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </>
                  )}
                </Button>

                <p className="pt-1 text-center text-xs text-muted">
                  Or{" "}
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="font-semibold text-accent hover:underline"
                  >
                    pick a demo persona below
                  </button>
                </p>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {error && <Notice tone="error" className="mx-auto mt-6 max-w-xl">{error}</Notice>}

        <div className="mt-8 flex justify-center gap-2">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            return (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  filter === f.id ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted hover:text-ink"}`}>
                <Icon className="h-3.5 w-3.5" /> {f.label}
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((u, i) => {
            const lvl = LEVEL_NAME[(u.clearance_label || "internal").toLowerCase()] ?? 1;
            const main = u.roles.find((r) => r !== "employee") ?? u.roles[0] ?? "employee";
            const Icon = ROLE_ICON[main] ?? User;
            const name = u.name.replace(/\s*\(.*\)/, "");
            return (
              <motion.button key={u.email} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                onClick={() => finish(post<Session>("/auth/demo-login", { email: u.email }), u.email)}
                disabled={busy !== null}
                className="glass glass-hover group relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-left disabled:opacity-60">
                <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br p-[2px] ${RING[lvl]}`}>
                  <span className="grid h-full w-full place-items-center rounded-[14px] bg-surface">
                    {busy === u.email ? <Loader2 className="h-6 w-6 animate-spin text-accent" /> : <Icon className={`h-6 w-6 ${LEVEL_TEXT[lvl]}`} strokeWidth={1.7} />}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="display block truncate text-lg text-ink">{name}</span>
                  <span className="block truncate text-xs capitalize text-muted">{main.replace(/_/g, " ")} · {u.department || u.tenant}</span>
                  <span className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold ${LEVEL_TEXT[lvl]}`}>
                    <Lock className="h-3 w-3" /> {LEVELS[lvl]}
                    {u.tenant !== "Acme Corp" && <span className="ml-1 rounded-full bg-ai-light px-1.5 text-ai">{u.tenant}</span>}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-light transition-transform group-hover:translate-x-1 group-hover:text-accent" />
              </motion.button>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-muted">
          New company? <Link to="/register" className="font-semibold text-accent hover:underline">Register a workspace</Link>
        </p>
      </div>
    </main>
  );
}
