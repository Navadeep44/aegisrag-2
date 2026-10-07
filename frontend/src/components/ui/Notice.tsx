import type { ReactNode } from "react";
import { AlertCircle, Info } from "lucide-react";

export function Notice({
  tone,
  children,
  className = "",
}: {
  tone: "error" | "info";
  children: ReactNode;
  className?: string;
}) {
  const isError = tone === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-xs sm:text-sm leading-relaxed ${
        isError
          ? "border-deny-border bg-deny-bg text-deny"
          : "border-line bg-surface text-muted"
      } ${className}`}
    >
      {isError ? (
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-deny" />
      ) : (
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-sky-600" />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
