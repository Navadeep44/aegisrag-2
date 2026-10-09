import type { ReactNode } from "react";
import { Globe2, Lock, ShieldAlert, Users } from "lucide-react";
import { LEVELS } from "../../lib/types";

const text = ["text-level-0", "text-level-1", "text-level-2", "text-level-3"];
const edge = ["border-l-level-0", "border-l-level-1", "border-l-level-2", "border-l-level-3"];
export const LEVEL_ICONS = [Globe2, Users, Lock, ShieldAlert];

/** Every document and source carries its classification on its left edge. */
export function Banded({ level, children, className = "" }: { level: number; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line border-l-[3px] bg-surface ${edge[level]} ${className}`}>{children}</div>
  );
}

export function Level({ level }: { level: number }) {
  const Icon = LEVEL_ICONS[level] ?? Users;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${text[level]}`}>
      <Icon className="h-3 w-3" /> {LEVELS[level]}
    </span>
  );
}
