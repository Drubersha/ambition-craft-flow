import { useEffect, useRef } from "react";

const COLORS = ["#22c55e", "#3b82f6", "#eab308", "#ef4444", "#a855f7", "#06b6d4"];

/**
 * Lightweight, dependency-free confetti burst (Web Animations API).
 * Renders inside a relatively-positioned parent and cleans itself up.
 */
export function Confetti({ count = 70 }: { count?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || typeof window === "undefined") return;
    const pieces: HTMLSpanElement[] = [];
    for (let i = 0; i < count; i++) {
      const s = document.createElement("span");
      const size = 6 + Math.random() * 6;
      s.style.cssText = `position:absolute;top:-12px;left:${Math.random() * 100}%;width:${size}px;height:${
        size * 0.4
      }px;background:${COLORS[i % COLORS.length]};border-radius:1px;will-change:transform,opacity;`;
      host.appendChild(s);
      const dx = (Math.random() - 0.5) * 220;
      const dy = 180 + Math.random() * 320;
      const rot = (Math.random() - 0.5) * 720;
      s.animate(
        [
          { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity: 0 },
        ],
        {
          duration: 1500 + Math.random() * 1200,
          easing: "cubic-bezier(.2,.6,.4,1)",
          fill: "forwards",
          delay: Math.random() * 250,
        },
      );
      pieces.push(s);
    }
    const t = setTimeout(() => pieces.forEach((p) => p.remove()), 3200);
    return () => {
      clearTimeout(t);
      pieces.forEach((p) => p.remove());
    };
  }, [count]);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />
  );
}
