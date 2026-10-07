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
 * Creates and configures a Lenis smooth scroll instance synchronized with GSAP.
 * Supports target scroller element (for inner container layouts).
 */
export function createLenis(scroller?: HTMLElement | null): Lenis | null {
  if (typeof window === "undefined" || prefersReducedMotion()) {
    return null;
  }

  const lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: "vertical",
    gestureOrientation: "vertical",
    smoothWheel: true,
    wrapper: scroller || window,
    content: scroller ? (scroller.firstElementChild as HTMLElement) || scroller : document.documentElement,
  });

  // Synchronize Lenis scroll with GSAP ScrollTrigger
  lenis.on("scroll", () => {
    ScrollTrigger.update();
  });

  // Sync animation frames via GSAP ticker
  const tickerCallback = (time: number) => {
    lenis.raf(time * 1000);
  };
  gsap.ticker.add(tickerCallback);
  gsap.ticker.lagSmoothing(0);

  // If a custom scroller is used, inform ScrollTrigger
  if (scroller) {
    ScrollTrigger.defaults({ scroller });
  }

  return lenis;
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
