/** AegisRAG mark: a shield whose core is a retrieval node graph. */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="lm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0d9488" />
          <stop offset="0.55" stopColor="#0f766e" />
          <stop offset="1" stopColor="#b4532a" />
        </linearGradient>
      </defs>
      <path d="M20 3 L34 8.5 V19c0 8.6-5.9 15.4-14 18-8.1-2.6-14-9.4-14-18V8.5Z"
        fill="rgba(15,118,110,0.08)" stroke="url(#lm-g)" strokeWidth="2.2" strokeLinejoin="round" />
      <g stroke="url(#lm-g)" strokeWidth="1.6" strokeLinecap="round">
        <path d="M14 16 L20 21 L26 15 M20 21 V28" fill="none" />
      </g>
      <circle cx="14" cy="16" r="2.2" fill="#0d9488" />
      <circle cx="26" cy="15" r="2.2" fill="#b4532a" />
      <circle cx="20" cy="21" r="2.6" fill="#0f766e" />
      <circle cx="20" cy="28" r="2" fill="#d97745" />
    </svg>
  );
}

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const mark = { sm: "h-7 w-7", md: "h-8 w-8", lg: "h-11 w-11" }[size];
  const text = { sm: "text-base", md: "text-lg", lg: "text-2xl" }[size];
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className={mark} />
      <span className={`display ${text} tracking-tight text-ink`}>
        Aegis<span className="text-gradient">RAG</span>
      </span>
    </span>
  );
}
