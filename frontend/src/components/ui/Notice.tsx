import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";

export function Notice({ tone, children, className = "" }: { tone: "error" | "info"; children: ReactNode; className?: string }) {
  const isError = tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm ${
        isError ? "border-deny-border bg-deny-bg text-deny" : "border-accent/25 bg-accent/5 text-ink-light"
      } ${className}`}
    >
      {isError ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
