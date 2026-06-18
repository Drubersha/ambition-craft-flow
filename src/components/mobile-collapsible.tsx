import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Section card that collapses on mobile (tap the header to toggle).
 * Always expanded on md and up.
 */
export function MobileCollapsible({
  title,
  defaultOpen = true,
  action,
  children,
  className,
}: {
  title: ReactNode;
  defaultOpen?: boolean;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex items-center gap-2 px-4 py-3 md:border-b">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 font-semibold text-base flex-1 min-w-0 text-left md:cursor-default min-h-11 md:min-h-0"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-4 w-4 shrink-0 transition-transform md:hidden",
              !open && "-rotate-90",
            )}
          />
          <span className="truncate">{title}</span>
        </button>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn("px-4 pb-4", !open && "hidden md:block")}>{children}</div>
    </Card>
  );
}