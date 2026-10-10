import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Lock, Mail, ArrowRight, AlertCircle } from "lucide-react";
import { Button } from "../components/ui/Button";
import { inputClass } from "../components/ui/field";
import { Notice } from "../components/ui/Notice";
import { useAuth } from "../context/AuthContext";
import { api, post } from "../lib/api";
import type { PortalInfo, Session } from "../lib/types";

export default function RolePortal() {
  const { companySlug, roleSlug } = useParams<{ companySlug: string; roleSlug: string }>();
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [portalInfo, setPortalInfo] = useState<PortalInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!companySlug || !roleSlug) return;
    setLoadingInfo(true);
    setLoadError("");
    api<PortalInfo>(`/public/portal-info/${companySlug}/${roleSlug}`)
      .then((info) => {
        setPortalInfo(info);
      })
      .catch((err) => {
        setLoadError((err as Error).message || "Role portal not found.");
      })
      .finally(() => setLoadingInfo(false));
  }, [companySlug, roleSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companySlug || !roleSlug) return;
    setAuthError("");
    setSubmitting(true);
    try {
      const resp = await post<Session>("/public/portal-login", {
        company_slug: companySlug,
        role_slug: roleSlug,
        email: email.trim().toLowerCase(),
        password,
      });
      signIn(resp);
      navigate("/app/dashboard");
    } catch (err) {
      setAuthError((err as Error).message || "Invalid credentials for this role portal.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent mx-auto" />
          <p className="text-xs text-muted font-medium">Loading organization role workspace...</p>
        </div>
      </div>
    );
  }

  if (loadError || !portalInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page px-6">
        <div className="max-w-md w-full rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-deny/10 text-deny mb-4">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold text-ink">Role Portal Unavailable</h1>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            {loadError || "The specified role portal URL does not exist or has been archived."}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link to="/signin" className="inline-flex justify-center rounded-lg bg-ink px-4 py-2.5 text-xs font-semibold text-white">
              Go to Standard Sign In
            </Link>
            <Link to="/" className="text-xs text-muted hover:underline mt-2">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const companyInitials = portalInfo.company_name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen flex flex-col justify-between bg-page text-ink selection:bg-accent/20">
      {/* Brand Header */}
      <header className="border-b border-line bg-surface/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            {portalInfo.company_logo ? (
              <img src={portalInfo.company_logo} alt={portalInfo.company_name} className="h-8 max-w-[140px] object-contain" />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white font-bold text-xs shadow-2xs"
                style={{ backgroundColor: portalInfo.company_color || "#10b981" }}
              >
                {companyInitials}
              </div>
            )}
            <span className="font-semibold text-base tracking-tight text-ink">{portalInfo.company_name}</span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold border"
              style={{
                backgroundColor: `${portalInfo.company_color}15`,
                color: portalInfo.company_color,
                borderColor: `${portalInfo.company_color}30`,
              }}
            >
              {portalInfo.role_name} Portal
            </span>
          </div>
        </div>
      </header>

      {/* Main Login Card */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-sm"
        >
          {/* Company & Role Headline */}
          <div className="text-center mb-6">
            {portalInfo.company_logo ? (
              <img src={portalInfo.company_logo} alt={portalInfo.company_name} className="h-12 mx-auto object-contain mb-3" />
            ) : (
              <div
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white font-bold text-lg mb-3 shadow-xs"
                style={{ backgroundColor: portalInfo.company_color || "#10b981" }}
              >
                {companyInitials}
              </div>
            )}

            <h1 className="display text-2xl font-semibold tracking-tight text-ink">{portalInfo.role_name}</h1>
            <p className="text-xs text-muted mt-1 max-w-xs mx-auto">
              Dedicated intelligence portal for {portalInfo.company_name}.
            </p>

            {portalInfo.role_description && (
              <div className="mt-3 inline-block text-[0.72rem] text-muted bg-surface-hover border border-line px-3 py-1 rounded-full">
                {portalInfo.role_description}
              </div>
            )}
          </div>

          {/* Role Clearance Pill */}
          <div className="mb-6 rounded-xl border border-line/80 bg-surface-hover/50 p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent" />
              <span className="text-muted">Security Clearance:</span>
            </div>
            <span
              className={`rounded px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider ${
                portalInfo.clearance_label.toLowerCase() === "restricted"
                  ? "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                  : portalInfo.clearance_label.toLowerCase() === "confidential"
                  ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                  : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
              }`}
            >
              Level {portalInfo.clearance} • {portalInfo.clearance_label}
            </span>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                Work Email / Username
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
                <input
                  type="email"
                  required
                  placeholder="your.name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${inputClass} pl-9`}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pl-9`}
                />
              </div>
            </div>

            {authError && <Notice tone="error">{authError}</Notice>}

            <Button type="submit" disabled={submitting} className="w-full justify-center py-2.5 text-xs font-semibold shadow-xs">
              {submitting ? "Authenticating..." : `Sign In to ${portalInfo.role_name}`}
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </form>

          {/* Switch Portal Link */}
          <div className="mt-6 pt-4 border-t border-line text-center text-xs text-muted">
            <span>Wrong portal? </span>
            <Link to="/signin" className="text-accent font-medium hover:underline">
              Switch role or organization
            </Link>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-line py-4 text-center text-xs text-muted">
        <span>Protected by pre-retrieval SQL ACL enforcement. Verified tenant isolation.</span>
      </footer>
    </div>
  );
}
