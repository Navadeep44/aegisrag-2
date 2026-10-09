import { type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface SectionCardProps {
  title?: string;
  subtitle?: string;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: LucideIcon;
}

export function SectionCard({ title, subtitle, badge, action, children, className = "", icon: Icon }: SectionCardProps) {
  return (
    <section className={`glass rounded-2xl p-5 ${className}`}>
      {(title || action || badge) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface-subtle text-accent">
                <Icon className="h-4.5 w-4.5" strokeWidth={1.9} />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                {title && <h2 className="display text-lg text-ink">{title}</h2>}
                {badge}
              </div>
              {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
