import { type ReactNode } from "react";
import { Counter } from "../motion/Counter";

interface StatCardProps {
  label: string;
  value: number | string;
  total?: number;
  subtext?: string;
  badge?: ReactNode;
  tone?: "default" | "emerald" | "amber" | "rose" | "sky";
  onClick?: () => void;
  className?: string;
}

export function StatCard({
  label,
  value,
  total,
  subtext,
  badge,
  tone = "default",
  onClick,
  className = "",
}: StatCardProps) {
  const isNumber = typeof value === "number";

  const toneColorMap = {
    default: "text-ink",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
    sky: "text-sky-700",
  };

  const isClickable = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-line bg-surface p-5 shadow-xs transition-all duration-200 ${
        isClickable ? "cursor-pointer hover:border-ink/40 hover:shadow-sm" : ""
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted font-mono">{label}</p>
        {badge}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className={`display text-3xl sm:text-4xl font-semibold ${toneColorMap[tone]}`}>
          {isNumber ? <Counter value={value as number} /> : value}
        </span>
        {total !== undefined && (
          <span className="text-xs text-muted">
            of <strong className="text-ink font-medium">{total}</strong> total
          </span>
        )}
      </div>

      {subtext && <p className="mt-1 text-xs text-muted leading-relaxed">{subtext}</p>}
    </div>
  );
}
