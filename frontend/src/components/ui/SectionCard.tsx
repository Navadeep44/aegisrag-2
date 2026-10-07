import { type ReactNode } from "react";

interface SectionCardProps {
  title?: string;
  subtitle?: string;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionCard({
  title,
  subtitle,
  badge,
  action,
  children,
  className = "",
}: SectionCardProps) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-6 shadow-xs ${className}`}>
      {(title || action || badge) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              {title && <h2 className="display text-2xl font-semibold text-ink">{title}</h2>}
              {badge}
            </div>
            {subtitle && <p className="text-xs sm:text-sm text-muted mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
