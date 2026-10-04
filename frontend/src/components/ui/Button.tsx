import type { ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";

type Kind = "primary" | "quiet" | "danger" | "secondary";
type Size = "md" | "lg";

const kinds: Record<Kind, string> = {
  primary: "bg-ink text-white hover:bg-accent",
  quiet: "bg-surface text-ink border border-line hover:border-ink",
  secondary: "bg-surface text-ink border border-line hover:border-ink",
  danger: "bg-surface text-deny border border-line hover:border-deny",
};
const sizes: Record<Size, string> = {
  md: "rounded-md px-3.5 py-2 text-sm",
  lg: "rounded-full px-6 py-3 text-[0.95rem]",
};
const base = "inline-flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function Button({ kind = "primary", size = "md", className = "", ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind; size?: Size }) {
  return <button {...rest} className={`${base} ${kinds[kind]} ${sizes[size]} ${className}`} />;
}

export function ButtonLink({ kind = "primary", size = "md", className = "", ...rest }:
  LinkProps & { kind?: Kind; size?: Size }) {
  return <Link {...rest} className={`${base} ${kinds[kind]} ${sizes[size]} ${className}`} />;
}
