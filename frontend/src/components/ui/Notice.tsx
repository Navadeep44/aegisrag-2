import type { ReactNode } from "react";

export function Notice({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  const style = tone === "error" ? "border-deny text-deny" : "border-line text-muted";
  return (
    <p role={tone === "error" ? "alert" : undefined} className={`rounded-md border bg-surface px-3.5 py-2.5 text-sm ${style}`}>
      {children}
    </p>
  );
}
