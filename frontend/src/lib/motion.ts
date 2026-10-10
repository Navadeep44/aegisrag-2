import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

// Register GSAP plugins once
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export { gsap, ScrollTrigger, Lenis };

/**
 * Checks if the user prefers reduced motion.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Smooth scrolling is turned off: native scrolling is smoother on trackpads and
 * keeps the browser's own scroll behaviour. Kept as a hook point for LenisProvider.
 */
export function createLenis(_scroller?: HTMLElement | null): Lenis | null {
  return null;
}

/**
 * Safely refreshes all ScrollTriggers after layout shifts or DOM updates.
 */
export function refreshScrollTriggers(): void {
  if (typeof window !== "undefined") {
    requestAnimationFrame(() => {
      ScrollTrigger.refresh();
    });
  }
}
