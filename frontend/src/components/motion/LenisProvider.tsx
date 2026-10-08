import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createLenis, Lenis } from "../../lib/motion";

interface LenisContextType {
  lenis: Lenis | null;
  pauseLenis: () => void;
  resumeLenis: () => void;
  scrollTo: (target: string | number | HTMLElement, options?: Record<string, unknown>) => void;
}

const LenisContext = createContext<LenisContextType>({
  lenis: null,
  pauseLenis: () => {},
  resumeLenis: () => {},
  scrollTo: () => {},
});

export function LenisProvider({
  children,
  scrollerRef,
}: {
  children: ReactNode;
  scrollerRef?: React.RefObject<HTMLElement | null>;
}) {
  const [lenisInstance, setLenisInstance] = useState<Lenis | null>(null);
  const pauseCountRef = useRef(0);

  useEffect(() => {
    const scroller = scrollerRef?.current || null;
    const instance = createLenis(scroller);
    setLenisInstance(instance);

    return () => {
      instance?.destroy();
    };
  }, [scrollerRef]);

  const pauseLenis = () => {
    pauseCountRef.current += 1;
    if (lenisInstance && pauseCountRef.current === 1) {
      lenisInstance.stop();
    }
  };

  const resumeLenis = () => {
    pauseCountRef.current = Math.max(0, pauseCountRef.current - 1);
    if (lenisInstance && pauseCountRef.current === 0) {
      lenisInstance.start();
    }
  };

  const scrollTo = (target: string | number | HTMLElement, options?: Record<string, unknown>) => {
    if (lenisInstance) {
      lenisInstance.scrollTo(target, options);
      return;
    }

    const scroller = scrollerRef?.current;
    if (typeof target === "number") {
      if (scroller) {
        scroller.scrollTo({ top: target, behavior: "smooth" });
      } else if (typeof window !== "undefined") {
        window.scrollTo({ top: target, behavior: "smooth" });
      }
    } else if (typeof target === "string") {
      const el = document.querySelector(target);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <LenisContext.Provider value={{ lenis: lenisInstance, pauseLenis, resumeLenis, scrollTo }}>
      {children}
    </LenisContext.Provider>
  );
}

export function useLenisContext() {
  return useContext(LenisContext);
}
