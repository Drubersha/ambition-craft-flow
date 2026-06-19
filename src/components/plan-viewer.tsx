import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Maximize2, Minus, Plus, RotateCcw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;

export function PlanViewer({
  src,
  alt = "План",
  className,
  height = "h-[480px]",
}: {
  src: string;
  alt?: string;
  className?: string;
  height?: string;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <>
      <Stage src={src} alt={alt} className={cn(height, className)} onFullscreen={() => setFullscreen(true)} />
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] p-2 sm:p-3">
          <Stage src={src} alt={alt} className="h-full" />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stage({
  src, alt, className, onFullscreen,
}: { src: string; alt: string; className?: string; onFullscreen?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

  const reset = useCallback(() => { setScale(1); setTx(0); setTy(0); }, []);

  // Recenter on src change
  useEffect(() => { setLoaded(false); reset(); }, [src, reset]);

  const zoomAt = useCallback((nextScale: number, cx?: number, cy?: number) => {
    setScale((prev) => {
      const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
      if (cx !== undefined && cy !== undefined && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const ox = cx - rect.left - rect.width / 2;
        const oy = cy - rect.top - rect.height / 2;
        const k = ns / prev;
        setTx((t) => ox - (ox - t) * k);
        setTy((t) => oy - (oy - t) * k);
      }
      return ns;
    });
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoomAt(scale * factor, e.clientX, e.clientY);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setTx(dragRef.current.tx + (e.clientX - dragRef.current.x));
    setTy(dragRef.current.ty + (e.clientY - dragRef.current.y));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  // Touch pinch
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), scale };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      zoomAt((pinchRef.current.scale * dist) / pinchRef.current.dist, cx, cy);
    }
  };
  const onTouchEnd = () => { pinchRef.current = null; };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (scale > 1.01) reset();
    else zoomAt(2, e.clientX, e.clientY);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") { zoomAt(scale * 1.2); e.preventDefault(); }
    else if (e.key === "-") { zoomAt(scale / 1.2); e.preventDefault(); }
    else if (e.key === "0") { reset(); e.preventDefault(); }
  };

  return (
    <div className={cn("relative w-full rounded border bg-muted overflow-hidden select-none", className)}>
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center touch-none cursor-grab active:cursor-grabbing focus:outline-none"
        tabIndex={0}
        role="img"
        aria-label={alt}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKey}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setLoaded(true)}
          className="max-w-none max-h-none will-change-transform"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: "center center",
            transition: dragRef.current || pinchRef.current ? "none" : "transform 80ms linear",
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            visibility: loaded ? "visible" : "hidden",
          }}
        />
      </div>

      <div className="absolute top-2 right-2 flex gap-1 bg-background/80 backdrop-blur rounded-md p-1 shadow">
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => zoomAt(scale / 1.25)} aria-label="Уменьшить">
          <Minus className="h-4 w-4" />
        </Button>
        <div className="px-2 self-center text-xs tabular-nums w-12 text-center">{Math.round(scale * 100)}%</div>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => zoomAt(scale * 1.25)} aria-label="Увеличить">
          <Plus className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={reset} aria-label="Сбросить">
          <RotateCcw className="h-4 w-4" />
        </Button>
        {onFullscreen && (
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onFullscreen} aria-label="Во весь экран">
            <Maximize2 className="h-4 w-4" />
          </Button>
        )}
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center h-8 w-8 rounded hover:bg-accent"
          aria-label="Открыть в новой вкладке"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}