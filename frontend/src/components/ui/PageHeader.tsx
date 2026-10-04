import type { ReactNode } from "react";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="display text-4xl">{title}</h1>
      {children && <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-muted">{children}</p>}
    </header>
  );
}
