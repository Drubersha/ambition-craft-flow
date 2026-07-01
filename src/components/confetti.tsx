import { useEffect } from "react";

const COLORS = ["#22c55e", "#3b82f6", "#eab308", "#ef4444", "#a855f7", "#06b6d4", "#f97316"];

/**
 * Lightweight, dependency-free full-screen confetti burst (Web Animations API).
 * Mounts a fixed overlay on <body>, rains confetti across the viewport, then
 * cleans itself up. Renders no React DOM.
 */
export function Confetti({ count = 140 }: { count?: number }) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden";
    document.body.appendChild(host);

    for (let i = 0; i < count; i++) {
      const piece = document.createElement("span");
      const size = 6 + Math.random() * 8;
      piece.style.cssText = `position:absolute;top:-24px;left:${Math.random() * 100}vw;width:${size}px;height:${
        size * 0.5
      }px;background:${COLORS[i % COLORS.length]};border-radius:1px;`;
      host.appendChild(piece);
      const driftVw = (Math.random() - 0.5) * 40;
      const fallVh = 100 + Math.random() * 20;
      const rot = (Math.random() - 0.5) * 1080;
      piece.animate(
        [
          { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
          {
            transform: `translate(${driftVw}vw, ${fallVh}vh) rotate(${rot}deg)`,
            opacity: 1,
            offset: 0.9,
          },
          { transform: `translate(${driftVw}vw, ${fallVh}vh) rotate(${rot}deg)`, opacity: 0 },
        ],
        {
          duration: 2600 + Math.random() * 1600,
          easing: "cubic-bezier(.15,.5,.5,1)",
          fill: "forwards",
          delay: Math.random() * 350,
        },
      );
    }

    const t = setTimeout(() => host.remove(), 4800);
    return () => {
      clearTimeout(t);
      host.remove();
    };
  }, [count]);

  return null;
}
