import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { CSSProperties, ReactElement } from "react";

export const BRAND_NAVY = "#0b2f3a";
export const BRAND_TEAL = "#22b8a5";
export const BRAND_SLOGAN = "Making leasing easy.";

export type BrandVariant = "mark" | "wordmark" | "lockup" | "lockupWithSlogan" | "slogan";
export type BrandSize = "sm" | "md" | "lg";

const MARK_HEIGHT: Record<BrandSize, number> = { sm: 20, md: 28, lg: 44 };
const WORD_SIZE: Record<BrandSize, string> = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
};
const SLOGAN_SIZE: Record<BrandSize, string> = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
};

function Mark({ size, decorative }: { size: BrandSize; decorative: boolean }) {
  const h = MARK_HEIGHT[size];
  return (
    <svg
      viewBox="0 0 64 96"
      height={h}
      width={(h * 64) / 96}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "LeasePlease"}
      aria-hidden={decorative || undefined}
      focusable="false"
    >
      <g
        fill="none"
        stroke={BRAND_NAVY}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 10 H40 a14 14 0 0 1 0 28 H30 V22 H40" />
        <path d="M32 38 V82" />
        <path d="M32 66 H44" />
        <path d="M32 76 H40" />
      </g>
      <g stroke={BRAND_TEAL} strokeWidth={4} strokeLinecap="round">
        <path d="M50 10 L56 6" />
        <path d="M54 18 L60 18" />
        <path d="M50 26 L56 30" />
      </g>
    </svg>
  );
}

function Wordmark({ size }: { size: BrandSize }) {
  return (
    <span className={cn("font-bold tracking-tight leading-none", WORD_SIZE[size])}>
      <span style={{ color: BRAND_NAVY }}>Lease</span>
      <span style={{ color: BRAND_TEAL }}>Please</span>
    </span>
  );
}

function Slogan({ size }: { size: BrandSize }) {
  return (
    <span
      className={cn("uppercase tracking-[0.18em] font-semibold leading-none", SLOGAN_SIZE[size])}
      style={{ color: BRAND_NAVY }}
    >
      {BRAND_SLOGAN.toUpperCase().replace(/\.$/, "")}
      <span aria-hidden style={{ color: BRAND_TEAL, marginLeft: 6 }}>
        ♥
      </span>
    </span>
  );
}

export interface BrandLogoProps {
  variant?: BrandVariant;
  size?: BrandSize;
  clickable?: boolean;
  to?: string;
  className?: string;
  style?: CSSProperties;
}

export function BrandLogo({
  variant = "lockup",
  size = "md",
  clickable = false,
  to = "/",
  className,
  style,
}: BrandLogoProps): ReactElement {
  const decorative = !clickable && variant === "mark";
  const content =
    variant === "mark" ? (
      <Mark size={size} decorative={decorative} />
    ) : variant === "wordmark" ? (
      <Wordmark size={size} />
    ) : variant === "slogan" ? (
      <Slogan size={size} />
    ) : variant === "lockup" ? (
      <span className="inline-flex items-center gap-2">
        <Mark size={size} decorative />
        <Wordmark size={size} />
      </span>
    ) : (
      <span className="inline-flex items-center gap-3">
        <Mark size={size} decorative />
        <span className="inline-flex flex-col gap-1">
          <Wordmark size={size} />
          <Slogan size={size === "lg" ? "md" : "sm"} />
        </span>
      </span>
    );

  if (clickable) {
    return (
      <Link
        to={to}
        aria-label="На главную LeasePlease"
        className={cn("inline-flex items-center", className)}
        style={style}
      >
        {content}
      </Link>
    );
  }
  return (
    <span className={cn("inline-flex items-center", className)} style={style}>
      {content}
    </span>
  );
}

export default BrandLogo;
