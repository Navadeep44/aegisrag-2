import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: ReactNode; // Subtitle fallback
  breadcrumbs?: BreadcrumbItem[];
  action?: ReactNode; // Maximum 1 primary action button
}

export function PageHeader({
  title,
  subtitle,
  children,
  breadcrumbs,
  action,
}: PageHeaderProps) {
  const description = subtitle || children;

  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0 max-w-3xl space-y-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted mb-1">
            {breadcrumbs.map((item, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <span key={index} className="flex items-center gap-1">
                  {item.href && !isLast ? (
                    <Link to={item.href} className="hover:text-ink transition-colors">
                      {item.label}
                    </Link>
                  ) : (
                    <span className={isLast ? "text-ink font-medium" : ""}>{item.label}</span>
                  )}
                  {!isLast && <ChevronRight className="h-3 w-3 text-muted/60" />}
                </span>
              );
            })}
          </nav>
        )}

        <h1 className="display text-3xl sm:text-4xl text-ink font-semibold tracking-tight">
          {title}
        </h1>

        {description && (
          <p className="text-sm sm:text-[0.95rem] text-muted leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}
