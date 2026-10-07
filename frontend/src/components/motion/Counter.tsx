import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../../lib/motion";

interface CounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function Counter({
  value,
  duration = 1.0,
  prefix = "",
  suffix = "",
  className = "",
}: CounterProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const elementRef = useRef<HTMLSpanElement>(null);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplayValue(value);
      return;
    }

    const element = elementRef.current;
    if (!element) return;

    let observer: IntersectionObserver | null = null;

    const startCountAnimation = () => {
      if (hasAnimatedRef.current) return;
      hasAnimatedRef.current = true;

      const startTime = performance.now();
      const startValue = 0;
      const endValue = value;
      const totalDuration = duration * 1000;

      const updateCount = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / totalDuration);
        // Ease out exponential curve
        const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        const current = Math.round(startValue + (endValue - startValue) * easeProgress);

        setDisplayValue(current);

        if (progress < 1) {
          requestAnimationFrame(updateCount);
        } else {
          setDisplayValue(endValue);
        }
      };

      requestAnimationFrame(updateCount);
    };

    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          startCountAnimation();
          observer?.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(element);

    return () => {
      observer?.disconnect();
    };
  }, [value, duration]);

  return (
    <span ref={elementRef} className={className}>
      {prefix}
      {displayValue.toLocaleString()}
      {suffix}
    </span>
  );
}
