import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Upload,
  HeartPulse,
  Landmark,
  Scale,
  ShieldAlert,
  Cpu,
  FlaskConical,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { inputClass } from "../components/ui/field";
import { Notice } from "../components/ui/Notice";
import { useAuth } from "../context/AuthContext";
import { post } from "../lib/api";
import type { Session } from "../lib/types";

const CATEGORIES = [
  {
    id: "healthcare",
    name: "Hospital & Healthcare",
    badge: "Healthcare",
    icon: HeartPulse,
    roles: [
      { name: "Chief Medical Officer", clearance: "Restricted" },
      { name: "Doctor / Attending Physician", clearance: "Confidential" },
      { name: "Registered Nurse", clearance: "Internal" },
      { name: "Billing & Claims Specialist", clearance: "Internal" },
    ],
  },
  {
    id: "finance",
    name: "Banking & Finance",
    badge: "FINRA / SOC-2",
    icon: Landmark,
    roles: [
      { name: "Investment Director", clearance: "Restricted" },
      { name: "Portfolio & Equity Analyst", clearance: "Confidential" },
      { name: "Compliance Officer", clearance: "Restricted" },
      { name: "Commercial Branch Specialist", clearance: "Internal" },
    ],
  },
  {
    id: "legal",
    name: "Legal Advisory",
    badge: "Privilege Isolated",
    icon: Scale,
    roles: [
      { name: "Senior Managing Partner", clearance: "Restricted" },
      { name: "Associate Attorney", clearance: "Confidential" },
      { name: "Litigation Paralegal", clearance: "Internal" },
      { name: "Legal Practice Assistant", clearance: "Internal" },
    ],
  },
  {
    id: "defense",
    name: "Defense & Public Safety",
    badge: "ITAR / Compartmentalized",
    icon: ShieldAlert,
    roles: [
      { name: "Mission Director", clearance: "Restricted" },
      { name: "Lead Systems Engineer", clearance: "Confidential" },
      { name: "Logistics Specialist", clearance: "Internal" },
      { name: "Security Audit Officer", clearance: "Confidential" },
    ],
  },
  {
    id: "technology",
    name: "Technology & SaaS",
    badge: "Multi-Tenant Cloud",
    icon: Cpu,
    roles: [
      { name: "VP of Engineering", clearance: "Restricted" },
      { name: "Staff Systems Architect", clearance: "Confidential" },
      { name: "DevOps & SRE Lead", clearance: "Confidential" },
      { name: "Software Engineer", clearance: "Internal" },
    ],
  },
  {
    id: "pharma",
    name: "Pharmaceuticals & Trials",
    badge: "FDA 21 CFR Part 11",
    icon: FlaskConical,
    roles: [
      { name: "VP Clinical Research", clearance: "Restricted" },
      { name: "Principal Investigator", clearance: "Confidential" },
      { name: "Clinical Data Manager", clearance: "Confidential" },
      { name: "Trial Coordinator", clearance: "Internal" },
    ],
  },
];

export default function RegisterCompany() {
  const navigate = useNavigate();
  const { signIn } = useAuth();

  // Wizard Step (1: Company, 2: Roles & Industry, 3: Admin Account)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [category, setCategory] = useState("healthcare");
  const [customRoles, setCustomRoles] = useState<{ name: string }[]>([]);
  const [newRoleName, setNewRoleName] = useState("");

  const [founderName, setFounderName] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const computedSlug = companyName
    ? companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    : "company-slug";

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAddCustomRole = () => {
    if (!newRoleName.trim()) return;
    setCustomRoles((prev) => [...prev, { name: newRoleName.trim() }]);
    setNewRoleName("");
  };

  const handleRemoveCustomRole = (index: number) => {
    setCustomRoles((prev) => prev.filter((_, i) => i !== index));
  };

  const goToNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (step === 1) {
      if (!companyName.trim()) {
        setError("Please enter your company name.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate corporate email
    const emailParts = businessEmail.trim().toLowerCase().split("@");
    if (emailParts.length !== 2) {
      setError("Please provide a valid corporate email address.");
      return;
    }
    const domain = emailParts[1];
    const freeDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com"];
    if (freeDomains.includes(domain)) {
      setError("Please register with a corporate business email (e.g. name@company.business.com). Personal email providers are blocked.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        company_name: companyName.trim(),
        founder_name: founderName.trim(),
        business_email: businessEmail.trim().toLowerCase(),
        password,
        company_category: category,
        website: website.trim() || undefined,
        logo_url: logoPreview || undefined,
        custom_roles: customRoles.map((r) => r.name),
      };

      const session = await post<Session>("/auth/register-company", payload);
      signIn(session);
      navigate("/app/dashboard");
    } catch (err) {
      setError((err as Error).message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const selectedCategoryObj = CATEGORIES.find((c) => c.id === category) || CATEGORIES[0];

  return (
    <div className="min-h-screen bg-page text-ink selection:bg-accent/20">
      {/* Slim Header */}
      <header className="border-b border-line bg-surface/90 backdrop-blur-md px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white font-bold text-sm">
              AR
            </div>
            <span className="font-semibold text-ink text-sm">Eyes Only Enterprise</span>
          </Link>

          <Link to="/signin" className="text-xs text-muted hover:text-ink transition-colors">
            Already registered? <span className="text-accent font-medium">Sign in</span>
          </Link>
        </div>
      </header>

      {/* Main Wizard */}
      <main className="mx-auto max-w-2xl px-6 py-12">
        {/* Step Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted mb-2">
            <span className={step >= 1 ? "text-ink font-bold" : ""}>1. Company</span>
            <span className={step >= 2 ? "text-ink font-bold" : ""}>2. Industry & Roles</span>
            <span className={step >= 3 ? "text-ink font-bold" : ""}>3. Admin Account</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface-subtle overflow-hidden">
            <div
              className="h-full bg-ink transition-all duration-300"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </div>

        {error && <Notice tone="error" className="mb-6">{error}</Notice>}

        {/* STEP 1: Company Profile */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-xs space-y-6"
          >
            <div>
              <h2 className="text-xl font-bold text-ink">Company Identity</h2>
              <p className="text-xs text-muted mt-1">
                Your company brand will be displayed on your private workspace.
              </p>
            </div>

            <form onSubmit={goToNextStep} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink mb-1.5">
                  Company Name <span className="text-deny">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. St. Jude Memorial Hospital, Apex Capital"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className={inputClass}
                />
                {companyName && (
                  <p className="mt-1.5 text-xs text-muted">
                    Portal slug: <code className="font-mono text-ink">/portal/{computedSlug}/[role]</code>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1.5">Company Website (Optional)</label>
                <input
                  type="url"
                  placeholder="https://company.business.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1.5">Company Logo (Optional)</label>
                <div className="flex items-center gap-3">
                  {logoPreview ? (
                    <div className="relative h-12 w-12 shrink-0 rounded-lg border border-line bg-white p-1 overflow-hidden">
                      <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
                      <button
                        type="button"
                        onClick={() => setLogoPreview(null)}
                        className="absolute -top-1 -right-1 bg-ink text-white rounded-full p-0.5 text-[0.6rem]"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface-subtle px-3 text-xs text-muted hover:border-ink hover:text-ink transition-colors">
                      <Upload className="h-4 w-4" />
                      <span>Upload Logo image</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </label>
                  )}
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button type="submit" disabled={!companyName.trim()}>
                  <span>Continue to Roles</span>
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </form>
          </motion.div>
        )}

        {/* STEP 2: Category & Roles */}
        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-xs space-y-6"
          >
            <div>
              <h2 className="text-xl font-bold text-ink">Select Industry Category</h2>
              <p className="text-xs text-muted mt-1">
                Auto-configures role portals and security clearances for your industry.
              </p>
            </div>

            <form onSubmit={goToNextStep} className="space-y-6">
              {/* Category Grid */}
              <div className="grid grid-cols-2 gap-3">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`text-left p-3.5 rounded-xl border transition-all ${
                        isSelected
                          ? "border-ink bg-surface-subtle shadow-xs"
                          : "border-line bg-surface hover:border-line-strong"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-4 w-4 text-ink" />
                        <span className="font-semibold text-xs text-ink truncate">{cat.name}</span>
                      </div>
                      <span className="text-[0.68rem] text-muted block truncate">{cat.badge}</span>
                    </button>
                  );
                })}
              </div>

              {/* Roles Preview */}
              <div className="rounded-xl border border-line bg-surface-subtle/50 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-ink">
                  <span>Included Role Portals ({selectedCategoryObj.roles.length + customRoles.length})</span>
                  <span className="text-muted font-normal text-[0.7rem]">Clearance</span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {selectedCategoryObj.roles.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-surface border border-line">
                      <span className="font-medium text-ink">{r.name}</span>
                      <span className="text-[0.65rem] text-muted uppercase font-mono">{r.clearance}</span>
                    </div>
                  ))}
                  {customRoles.map((cr, idx) => (
                    <div key={`custom_${idx}`} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-surface border border-line">
                      <span className="font-medium text-ink">{cr.name} (Custom)</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomRole(idx)}
                        className="text-muted hover:text-deny"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Custom Role */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add custom role... e.g. Clinical Pharmacist"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  className={inputClass}
                />
                <Button type="button" kind="secondary" onClick={handleAddCustomRole} className="shrink-0">
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>

              <div className="pt-4 flex justify-between border-t border-line">
                <Button type="button" kind="secondary" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
                </Button>
                <Button type="submit">
                  <span>Continue to Account</span>
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </form>
          </motion.div>
        )}

        {/* STEP 3: Founder Credentials */}
        {step === 3 && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-xs space-y-6"
          >
            <div>
              <h2 className="text-xl font-bold text-ink">Admin Account</h2>
              <p className="text-xs text-muted mt-1">
                You will be the organization owner with full administrative control.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink mb-1.5">
                  Your Full Name <span className="text-deny">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Robert Vance"
                  value={founderName}
                  onChange={(e) => setFounderName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1.5">
                  Business Email <span className="text-deny">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@company.business.com"
                  value={businessEmail}
                  onChange={(e) => setBusinessEmail(e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-[0.7rem] text-muted">
                  Must be corporate domain (e.g. @business.com). Consumer emails are blocked.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1.5">
                  Password <span className="text-deny">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="pt-4 flex justify-between border-t border-line">
                <Button type="button" kind="secondary" onClick={() => setStep(2)} disabled={loading}>
                  <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
                </Button>
                <Button type="submit" disabled={loading || !founderName || !businessEmail || !password}>
                  {loading ? "Creating Organization..." : "Launch Organization Workspace"}
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </form>
          </motion.div>
        )}
      </main>
    </div>
  );
}
