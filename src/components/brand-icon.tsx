import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";

export type BrandIconSize = "sm" | "md" | "lg";
export type BrandIconTone =
  | "default"
  | "navy"
  | "teal"
  | "muted"
  | "danger"
  | "success"
  | "warning";

const SIZE_PX: Record<BrandIconSize, number> = { sm: 14, md: 18, lg: 24 };
const SIZE_CLS: Record<BrandIconSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-[18px] w-[18px]",
  lg: "h-6 w-6",
};
const TONE_CLS: Record<BrandIconTone, string> = {
  default: "text-foreground",
  navy: "text-[color:var(--brand-navy)]",
  teal: "text-[color:var(--brand-teal)]",
  muted: "text-muted-foreground",
  danger: "text-destructive",
  success: "text-[color:var(--success)]",
  warning: "text-[color:var(--warning)]",
};

type LucideLike = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

export interface BrandIconProps {
  icon: LucideLike;
  size?: BrandIconSize;
  tone?: BrandIconTone;
  className?: string;
  strokeWidth?: number;
  label?: string;
}

/**
 * Unified wrapper for lucide-react icons in the LeasePlease brand style:
 * rounded caps/joins (lucide default), consistent stroke width and sizes,
 * and semantic brand color tones via design tokens.
 */
export function BrandIcon({
  icon: Icon,
  size = "md",
  tone = "default",
  className,
  strokeWidth = 1.75,
  label,
}: BrandIconProps) {
  const decorative = !label;
  return (
    <Icon
      width={SIZE_PX[size]}
      height={SIZE_PX[size]}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", SIZE_CLS[size], TONE_CLS[tone], className)}
      aria-hidden={decorative || undefined}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
    />
  );
}

export default BrandIcon;