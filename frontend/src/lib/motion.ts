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
 * Creates and configures smooth scrolling synchronized with GSAP.
 * Avoids intercepting and breaking native mouse wheel events.
 */
export function createLenis(scroller?: HTMLElement | null): Lenis | null {
  // Let the browser manage hardware-accelerated mouse wheel scrolling natively
  // to ensure smooth, responsive scrolling across all devices and pages.
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
