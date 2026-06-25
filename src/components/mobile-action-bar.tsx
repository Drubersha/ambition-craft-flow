import type { ReactNode } from "react";

/**
 * Sticky action bar pinned to the bottom of the viewport on mobile only.
 * Reserves space at the bottom so content isn't covered.
 */
export function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="h-20 md:hidden" aria-hidden="true" />
      <div
        role="toolbar"
        aria-label="Действия"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center gap-2 supports-[backdrop-filter]:bg-background/80"
      >
        {children}
      </div>
    </>
  );
}
