import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

export interface OrbitingCirclesProps {
  className?: string;
  children?: React.ReactNode;
  reverse?: boolean;
  duration?: number;
  delay?: number;
  radius?: number;
  startAngle?: number;
  path?: boolean;
}

export default function OrbitingCircles({
  className,
  children,
  reverse,
  duration = 20,
  delay = 10,
  radius = 50,
  startAngle = 0,
  path = true,
}: OrbitingCirclesProps) {
  const orbitRef = useRef<HTMLDivElement | null>(null);
  const [isInView, setIsInView] = useState(true);
  const [isPageVisible, setIsPageVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden,
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const onVisibilityChange = () => setIsPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onPreferenceChange = () => setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", onPreferenceChange);
    return () => mediaQuery.removeEventListener("change", onPreferenceChange);
  }, []);

  useEffect(() => {
    if (!orbitRef.current || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0.05 },
    );

    observer.observe(orbitRef.current);
    return () => observer.disconnect();
  }, []);

  const shouldAnimate = !prefersReducedMotion;
  const shouldPause = !isInView || !isPageVisible;

  return (
    <>
      {path && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          version="1.1"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <circle
            className="stroke-border stroke-1 dark:stroke-border"
            cx="50%"
            cy="50%"
            r={radius}
            fill="none"
          />
        </svg>
      )}

      <div
        ref={orbitRef}
        style={
          {
            "--duration": duration,
            "--radius": radius,
            "--delay": -delay,
            "--start-angle": `${startAngle}deg`,
            ...(prefersReducedMotion
              ? {
                  transform: `rotate(${startAngle}deg) translateX(${radius}px) rotate(${-startAngle}deg)`,
                }
              : {}),
          } as React.CSSProperties
        }
        className={cn(
          "absolute flex size-[2rem] transform-gpu items-center justify-center rounded-full border border-border bg-background [animation-delay:calc(var(--delay)*1000ms)] dark:bg-background",
          {
            "animate-orbit": shouldAnimate,
            "[animation-direction:reverse]": reverse,
            "[animation-play-state:paused]": shouldAnimate && shouldPause,
          },
          className
        )}
      >
        {children}
      </div>
    </>
  );
}
