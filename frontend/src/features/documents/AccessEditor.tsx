import { useState } from "react";
import { ClearancePill } from "../../components/ui/StatusPill";
import { LEVELS, type Department, type Doc, type Grant, type Role, type User } from "../../lib/types";
import { Users, User as UserIcon, Building2, Shield, Plus, X } from "lucide-react";

interface AccessEditorProps {
  doc: Doc;
  roles: Role[];
  users: User[];
  departments?: Department[];
  onSave: (doc: Doc, grants: Grant[], classification?: number) => void;
}

export function AccessEditor({
  doc,
  roles,
  users,
  departments = [],
  onSave,
}: AccessEditorProps) {
  const grants = doc.access ?? [];

  // Deduplicate grants by type and subject_id
  const uniqueGrantsMap = new Map<string, Grant>();
  for (const g of grants) {
    const key = `${g.subject_type}:${g.subject_id ?? "all"}`;
    if (!uniqueGrantsMap.has(key)) {
      uniqueGrantsMap.set(key, g);
    }
  }
  const cleanGrants = Array.from(uniqueGrantsMap.values());

  const has = (type: string, id: string | null) =>
    cleanGrants.some((g) => g.subject_type === type && g.subject_id === id);

  const toggle = (type: Grant["subject_type"], id: string | null) => {
    const exists = has(type, id);
    let updatedGrants: Grant[];
    if (exists) {
      updatedGrants = cleanGrants.filter(
        (g) => !(g.subject_type === type && g.subject_id === id)
      );
    } else {
      updatedGrants = [...cleanGrants, { subject_type: type, subject_id: id }];
    }
    onSave(doc, updatedGrants);
  };

  const individualGrants = cleanGrants.filter((g) => g.subject_type === "user");
  const ungrantedUsers = users.filter((u) => !has("user", u.id));

  return (
    <div className="space-y-6 text-xs sm:text-sm">
      {/* Classification Tier Selector */}
      <div className="rounded-xl border border-line bg-surface p-4 space-y-2">
        <label className="flex items-center justify-between">
          <span className="font-semibold text-ink flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-accent" />
            <span>Classification Tier</span>
          </span>
          <ClearancePill clearance={doc.classification} />
        </label>
        <select
          aria-label={`Classification of ${doc.title}`}
          value={doc.classification}
          onChange={(e) => onSave(doc, cleanGrants, Number(e.target.value))}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
        >
          {LEVELS.map((label, i) => (
            <option key={label} value={i}>
              Level {i} — {label}
            </option>
          ))}
        </select>
        <p className="text-[0.7rem] text-muted leading-relaxed">
          Users must possess a clearance level equal to or higher than this tier to search this document.
        </p>
      </div>

      {/* Role Grants */}
      <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-ink flex items-center gap-1.5">
            <Users className="h-4 w-4 text-muted" />
            <span>Role Grants</span>
          </span>
          <span className="text-[0.7rem] text-muted">Who can search</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => toggle("everyone", null)}
            className={`rounded-full border px-3 py-1 text-xs transition-all ${
              has("everyone", null)
                ? "border-allow bg-allow text-white shadow-xs"
                : "border-line bg-surface text-muted hover:border-ink hover:text-ink"
            }`}
          >
            Everyone
          </button>

          {roles.map((r) => {
            const active = has("role", r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggle("role", r.id)}
                className={`rounded-full border px-3 py-1 text-xs transition-all ${
                  active
                    ? "border-allow bg-allow text-white shadow-xs"
                    : "border-line bg-surface text-muted hover:border-ink hover:text-ink"
                }`}
              >
                {r.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Department Grants */}
      {departments.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-ink flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-muted" />
              <span>Department Boundary Grants</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {departments.map((d) => {
              const active = has("department", d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggle("department", d.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition-all ${
                    active
                      ? "border-allow bg-allow text-white shadow-xs"
                      : "border-line bg-surface text-muted hover:border-ink hover:text-ink"
                  }`}
                >
                  {d.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Individual Grants (Deduplicated) */}
      <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-ink flex items-center gap-1.5">
            <UserIcon className="h-4 w-4 text-muted" />
            <span>Individual Grants (Named Exceptions)</span>
          </span>
          <span className="text-[0.7rem] text-muted">
            {individualGrants.length} person(s)
          </span>
        </div>

        {individualGrants.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {individualGrants.map((g) => {
              const label = g.label || users.find((u) => u.id === g.subject_id)?.name || g.subject_id;
              return (
                <button
                  key={g.subject_id}
                  type="button"
                  onClick={() => toggle("user", g.subject_id)}
                  className="flex items-center gap-1.5 rounded-full border border-allow-border bg-allow-bg px-3 py-1 text-xs font-medium text-allow hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors"
                  title="Click to revoke grant"
                >
                  <span>{label}</span>
                  <X className="h-3 w-3" />
                </button>
              );
            })}
          </div>
        )}

        {ungrantedUsers.length > 0 && (
          <div className="pt-1">
            <select
              aria-label={`Grant ${doc.title} to a person`}
              value=""
              onChange={(e) => e.target.value && toggle("user", e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-muted focus:text-ink focus:border-ink focus:outline-none"
            >
              <option value="">+ Grant access to an individual colleague…</option>
              {ungrantedUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.roles.join(", ")} • Clearance L{u.clearance})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface-subtle/50 p-3 text-xs text-muted leading-relaxed">
        <strong>How access works:</strong> Role and department grants require matching clearance. An individual grant is a named exception recorded in the audit log.
      </div>
    </div>
  );
}
