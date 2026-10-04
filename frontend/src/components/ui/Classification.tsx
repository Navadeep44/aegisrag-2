import type { ReactNode } from "react";
import { LEVELS } from "../../lib/types";

const text = ["text-level-0", "text-level-1", "text-level-2", "text-level-3"];
const edge = ["border-l-level-0", "border-l-level-1", "border-l-level-2", "border-l-level-3"];

/** Every document and source carries its classification on its left edge. */
export function Banded({ level, children, className = "" }: { level: number; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-md border border-line border-l-[3px] bg-surface ${edge[level]} ${className}`}>{children}</div>
  );
}

export function Level({ level }: { level: number }) {
  return <span className={`text-xs font-semibold ${text[level]}`}>{LEVELS[level]}</span>;
}
