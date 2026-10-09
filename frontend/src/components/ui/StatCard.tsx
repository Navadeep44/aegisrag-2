import { type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Counter } from "../motion/Counter";

interface StatCardProps {
  label: string;
  value: number | string;
  total?: number;
  subtext?: string;
  badge?: ReactNode;
  tone?: "default" | "emerald" | "amber" | "rose" | "sky" | "violet";
  onClick?: () => void;
  className?: string;
  icon?: LucideIcon;
}

const tones = {
  default: { text: "text-ink", icon: "text-accent bg-accent/10 border-accent/25", bar: "from-accent/60" },
  sky: { text: "text-accent", icon: "text-accent bg-accent/10 border-accent/25", bar: "from-accent/60" },
  emerald: { text: "text-allow", icon: "text-allow bg-allow/10 border-allow/25", bar: "from-allow/60" },
  amber: { text: "text-warn", icon: "text-warn bg-warn/10 border-warn/25", bar: "from-warn/60" },
  rose: { text: "text-deny", icon: "text-deny bg-deny/10 border-deny/25", bar: "from-deny/60" },
  violet: { text: "text-ai", icon: "text-ai bg-ai/10 border-ai/25", bar: "from-ai/60" },
};

export function StatCard({ label, value, total, subtext, badge, tone = "default", onClick, className = "", icon: Icon }: StatCardProps) {
  const t = tones[tone];
  return (
    <div
      onClick={onClick}
      className={`glass relative overflow-hidden rounded-2xl p-4 ${onClick ? "glass-hover cursor-pointer" : ""} ${className}`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${t.bar} to-transparent`} />
      <div className="flex items-start justify-between gap-2">
        {Icon ? (
          <div className={`grid h-9 w-9 place-items-center rounded-xl border ${t.icon}`}>
            <Icon className="h-4.5 w-4.5" strokeWidth={1.9} />
          </div>
        ) : <span />}
        {badge}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className={`display text-3xl ${t.text}`}>
          {typeof value === "number" ? <Counter value={value} /> : value}
        </span>
        {total !== undefined && <span className="text-xs text-muted">/ {total}</span>}
      </div>
      <p className="mt-0.5 text-xs font-medium text-muted">{label}</p>
      {subtext && <p className="mt-1 text-[11px] text-muted-light">{subtext}</p>}
    </div>
  );
}
