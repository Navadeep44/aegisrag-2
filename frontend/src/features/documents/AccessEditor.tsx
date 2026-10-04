import { smallSelectClass } from "../../components/ui/field";
import { LEVELS, type Department, type Doc, type Grant, type Role, type User } from "../../lib/types";

type Props = {
  doc: Doc;
  roles: Role[];
  users: User[];
  departments?: Department[];
  onSave: (doc: Doc, grants: Grant[], classification?: number) => void;
};

export function AccessEditor({ doc, roles, users, departments = [], onSave }: Props) {
  const grants = doc.access ?? [];
  const has = (type: string, id: string | null) => grants.some((g) => g.subject_type === type && g.subject_id === id);
  const toggle = (type: Grant["subject_type"], id: string | null) =>
    onSave(doc, has(type, id)
      ? grants.filter((g) => !(g.subject_type === type && g.subject_id === id))
      : [...grants, { subject_type: type, subject_id: id }]);
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-allow bg-allow text-white" : "border-line bg-surface text-muted hover:border-ink hover:text-ink"}`;
  const individuals = grants.filter((g) => g.subject_type === "user");
  const others = users.filter((u) => !has("user", u.id));

  return (
    <div className="mt-4 space-y-2.5 border-t border-line pt-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-muted">Roles</span>
        <button className={chip(has("everyone", null))} aria-pressed={has("everyone", null)} onClick={() => toggle("everyone", null)}>Everyone</button>
        {roles.map((r) => (
          <button key={r.id} className={chip(has("role", r.id))} aria-pressed={has("role", r.id)} onClick={() => toggle("role", r.id)}>{r.name}</button>
        ))}
      </div>
      {departments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-28 text-muted">Departments</span>
          {departments.map((d) => (
            <button key={d.id} className={chip(has("department", d.id))} aria-pressed={has("department", d.id)} onClick={() => toggle("department", d.id)}>
              {d.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-muted">Individuals</span>
        {individuals.map((g) => (
          <button key={g.subject_id} className={chip(true)} onClick={() => toggle("user", g.subject_id)} aria-label={`Revoke access for ${g.label}`}>
            {g.label} ✕
          </button>
        ))}
        <select aria-label={`Grant ${doc.title} to a person`} className={smallSelectClass} value=""
          onChange={(e) => e.target.value && toggle("user", e.target.value)}>
          <option value="">Grant to a person</option>
          {others.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 text-muted">Classification</span>
        <select aria-label={`Classification of ${doc.title}`} className={smallSelectClass}
          value={doc.classification} onChange={(e) => onSave(doc, grants, Number(e.target.value))}>
          {LEVELS.map((label, i) => <option key={label} value={i}>{label}</option>)}
        </select>
        <span className="text-xs text-muted">Role and department grants need matching clearance. An individual grant is a named exception.</span>
      </div>
    </div>
  );
}
