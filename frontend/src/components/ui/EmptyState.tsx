import { type ElementType, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "./Button";

interface EmptyStateProps {
  icon?: ElementType;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  actionElement?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = HelpCircle,
  title,
  description,
  actionText,
  onAction,
  actionElement,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface-subtle/60 p-8 sm:p-12 text-center ${className}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface border border-line shadow-xs text-muted mb-3.5">
        <Icon className="h-6 w-6" />
      </div>

      <h3 className="display text-xl font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-md text-xs sm:text-sm text-muted leading-relaxed">
        {description}
      </p>

      {(actionText || actionElement) && (
        <div className="mt-5">
          {actionElement ? (
            actionElement
          ) : actionText && onAction ? (
            <Button onClick={onAction} kind="primary">
              {actionText}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
