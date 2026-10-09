import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  action?: ReactNode;
  icon?: LucideIcon;
  tone?: "accent" | "ai" | "allow" | "warn" | "deny";
}

const tones = {
  accent: "from-accent/25 to-accent/5 text-accent border-accent/30",
  ai: "from-ai/25 to-ai/5 text-ai border-ai/30",
  allow: "from-allow/25 to-allow/5 text-allow border-allow/30",
  warn: "from-warn/25 to-warn/5 text-warn border-warn/30",
  deny: "from-deny/25 to-deny/5 text-deny border-deny/30",
};

/** Compact, icon-led header: one line of title, an optional one-line hint. */
export function PageHeader({ title, subtitle, children, breadcrumbs, action, icon: Icon, tone = "accent" }: PageHeaderProps) {
  const description = subtitle || children;
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        {Icon && (
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border bg-gradient-to-br ${tones[tone]}`}>
            <Icon className="h-6 w-6" strokeWidth={1.8} />
          </div>
        )}
        <div className="min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav aria-label="Breadcrumb" className="mb-0.5 flex items-center gap-1 text-[11px] text-muted">
              {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <span key={index} className="flex items-center gap-1">
                    {item.href && !isLast ? (
                      <Link to={item.href} className="hover:text-accent">{item.label}</Link>
                    ) : (
                      <span className={isLast ? "text-ink-light" : ""}>{item.label}</span>
                    )}
                    {!isLast && <ChevronRight className="h-3 w-3 opacity-50" />}
                  </span>
                );
              })}
            </nav>
          )}
          <h1 className="display truncate text-2xl text-ink sm:text-[1.7rem]">{title}</h1>
          {description && <p className="mt-0.5 line-clamp-1 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}
