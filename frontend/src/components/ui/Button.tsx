import type { ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";

type Kind = "primary" | "quiet" | "danger" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const kinds: Record<Kind, string> = {
  primary: "btn-primary",
  quiet: "bg-surface-subtle text-ink border border-line hover:border-accent/50 hover:text-accent",
  secondary: "bg-surface-subtle text-ink border border-line hover:border-accent/50 hover:text-accent",
  ghost: "text-muted hover:text-ink hover:bg-surface-hover",
  danger: "bg-deny-bg text-deny border border-deny-border hover:bg-deny/20",
};
const sizes: Record<Size, string> = {
  sm: "rounded-lg px-2.5 py-1.5 text-xs gap-1.5",
  md: "rounded-xl px-4 py-2.5 text-sm gap-2",
  lg: "rounded-2xl px-6 py-3.5 text-[0.95rem] gap-2",
};
const base =
  "inline-flex items-center justify-center font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";

export function Button({ kind = "primary", size = "md", className = "", ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind; size?: Size }) {
  return <button {...rest} className={`${base} ${kinds[kind]} ${sizes[size]} ${className}`} />;
}

export function ButtonLink({ kind = "primary", size = "md", className = "", ...rest }:
  LinkProps & { kind?: Kind; size?: Size }) {
  return <Link {...rest} className={`${base} ${kinds[kind]} ${sizes[size]} ${className}`} />;
}
