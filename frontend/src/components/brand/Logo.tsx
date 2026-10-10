import "@fontsource-variable/outfit";
import { useId } from "react";

/** Eyes Only mark: a one-line eye with a keyhole pupil inside a classified-document stamp.
 *  Same drawing as public/brand/eyes-only-mark.svg, inlined so it stays crisp at any size. */
export function LogoMark({ className = "h-8 w-8", stamp = true }: { className?: string; stamp?: boolean }) {
  const ink = `ink-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 120 82" className={className} aria-hidden="true">
      {stamp && (
        <>
          <defs>
            <mask id={ink}>
              <rect width="120" height="82" fill="#fff" />
              <g fill="#000">
                {[[36, 2.6, 1.1], [80, 2.2, 0.8], [2.4, 30, 0.9], [2.6, 58, 1], [117.4, 24, 0.7],
                  [118, 51, 1], [12, 79.4, 0.9], [62, 80, 0.7], [88, 79.6, 1]].map(([cx, cy, r]) => (
                  <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
                ))}
              </g>
            </mask>
          </defs>
          <rect x="2.4" y="2.4" width="115.2" height="77.2" rx="11.5" fill="none" stroke="#0F766E"
            strokeWidth="4.6" mask={`url(#${ink})`} />
        </>
      )}
      <g fill="none" stroke="#0F766E" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 41.4 C 30 12, 89 12, 109.6 41.4" />
        <path d="M10 41.4 C 24 55, 38 66, 52.6 64.4 A 21.5 21.5 0 1 1 65.6 64.4 C 80 66, 95 55, 109.6 41.4" />
      </g>
      <circle cx="59.1" cy="38.2" r="6.3" fill="#B4532A" />
      <path d="M56.6 41.5 H61.6 L65 54.6 H53.2 Z" fill="#B4532A" />
    </svg>
  );
}

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const mark = { sm: "h-7 w-10", md: "h-8 w-12", lg: "h-11 w-16" }[size];
  const text = { sm: "text-[1.05rem]", md: "text-xl", lg: "text-[1.7rem]" }[size];
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className={mark} />
      <span className={`${text} font-bold leading-none tracking-[-0.01em] text-[#1B2840]`}
        style={{ fontFamily: '"Outfit Variable", "Space Grotesk Variable", sans-serif' }}>
        Eyes Only
      </span>
    </span>
  );
}
