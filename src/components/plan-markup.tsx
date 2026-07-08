import { monthlyPayment } from "@/lib/format";
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { PlanOverlayCtx } from "@/components/plan-viewer";
import type { Marking, MarkingShape } from "@/lib/markings";

export type PropertyLite = {
  id: string;
  name: string;
  address: string;
  area_total: number;
  base_rate: number | null;
  currency: string;
};

export type ActiveContractLite = {
  id: string;
  rate: number;
  currency: string;
  payment_period: "monthly" | "quarterly" | "yearly" | "one_time";
  area: number | null;
  tenantName?: string;
};

const PERIOD_LABEL: Record<ActiveContractLite["payment_period"], string> = {
  monthly: "/мес",
  quarterly: "/кв",
  yearly: "/год",
  one_time: " (разово)",
};

const DEFAULT_COLOR = "hsl(217 91% 60%)";
const DRAFT_COLOR = "hsl(142 71% 45%)";

function fmt(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${Math.round(n)} ${currency}`;
  }
}

function shapeToPath(
  m: Marking,
  ctx: PlanOverlayCtx,
): {
  d?: string;
  circle?: { cx: number; cy: number; r: number };
  point?: { cx: number; cy: number };
} {
  if (m.shape === "polygon") {
    const pts = (m.coords as any).points as [number, number][];
    if (!pts || pts.length < 2) return {};
    const d =
      pts
        .map(([x, y], i) => {
          const p = ctx.toPx(x, y);
          return `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
        })
        .join(" ") + " Z";
    return { d };
  }
  if (m.shape === "circle") {
    const c = m.coords as any;
    const cp = ctx.toPx(c.cx, c.cy);
    const r = c.r * Math.min(ctx.width, ctx.height);
    return { circle: { cx: cp.x, cy: cp.y, r } };
  }
  const p = m.coords as any;
  const cp = ctx.toPx(p.cx, p.cy);
  return { point: { cx: cp.x, cy: cp.y } };
}

export type EditState =
  | { mode: "view" }
  | { mode: "draw"; tool: MarkingShape; propertyId: string; draft: [number, number][] };

export function PlanMarkup({
  ctx,
  markings,
  properties,
  contractsByProp,
  ahchByProp,
  edit,
  onAddPoint,
  onFinishPolygon,
  onPlacePoint,
}: {
  ctx: PlanOverlayCtx;
  markings: Marking[];
  properties: PropertyLite[];
  contractsByProp: Record<string, ActiveContractLite[] | undefined>;
  ahchByProp?: Record<string, ActiveContractLite[] | undefined>;
  edit: EditState;
  onAddPoint?: (n: { x: number; y: number }) => void;
  onFinishPolygon?: () => void;
  onPlacePoint?: (n: { x: number; y: number }) => void;
}) {
  const navigate = useNavigate();
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const propsById = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p])),
    [properties],
  );
  const isDrawing = edit.mode === "draw";

  // Client coords → overlay-local (unscaled) pixels. The plan can be zoomed
  // with a CSS transform, so the bounding rect is scale× larger than the
  // overlay's coordinate system — normalize through the rect dimensions
  // instead of subtracting the origin alone, otherwise clicks land in the
  // wrong place at any zoom other than 100%.
  const clientToLocal = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * ctx.width,
      y: ((clientY - rect.top) / rect.height) * ctx.height,
    };
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing) return;
    const p = clientToLocal(e.currentTarget as SVGSVGElement, e.clientX, e.clientY);
    const n = ctx.toNorm(p.x, p.y);
    if (edit.tool === "polygon") onAddPoint?.(n);
    else onPlacePoint?.(n);
  };

  const handleSvgDouble = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDrawing && edit.tool === "polygon" && edit.draft.length >= 3) {
      e.stopPropagation();
      onFinishPolygon?.();
    }
  };

  return (
    <>
      <svg
        width={ctx.width}
        height={ctx.height}
        viewBox={`0 0 ${ctx.width} ${ctx.height}`}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: isDrawing ? "auto" : "none",
          cursor: isDrawing ? "crosshair" : "default",
        }}
        onPointerDown={(e) => {
          if (isDrawing) e.stopPropagation();
        }}
        onClick={handleSvgClick}
        onDoubleClick={handleSvgDouble}
        onMouseLeave={() => setHover(null)}
      >
        {markings.map((m) => {
          const s = shapeToPath(m, ctx);
          const color = m.color || DEFAULT_COLOR;
          const common = {
            fill: color,
            fillOpacity: 0.18,
            stroke: color,
            strokeWidth: 2,
            style: { cursor: isDrawing ? "crosshair" : "pointer", pointerEvents: "all" as const },
            onPointerDown: (e: React.PointerEvent) => {
              e.stopPropagation();
            },
            onMouseEnter: (e: React.MouseEvent<SVGElement>) => {
              const p = clientToLocal(e.currentTarget.ownerSVGElement!, e.clientX, e.clientY);
              setHover({ id: m.property_id, x: p.x, y: p.y });
            },
            onMouseMove: (e: React.MouseEvent<SVGElement>) => {
              const p = clientToLocal(e.currentTarget.ownerSVGElement!, e.clientX, e.clientY);
              setHover({ id: m.property_id, x: p.x, y: p.y });
            },
            onClick: (e: React.MouseEvent) => {
              if (isDrawing) return;
              e.stopPropagation();
              navigate({ to: "/properties/$id", params: { id: m.property_id } });
            },
          };
          if (s.d) return <path key={m.id} d={s.d} {...common} />;
          if (s.circle) return <circle key={m.id} {...s.circle} {...common} />;
          if (s.point)
            return (
              <g key={m.id} {...common}>
                <circle
                  cx={s.point.cx}
                  cy={s.point.cy}
                  r={10}
                  fill={color}
                  fillOpacity={0.9}
                  stroke="white"
                  strokeWidth={2}
                />
                <circle cx={s.point.cx} cy={s.point.cy} r={3} fill="white" />
              </g>
            );
          return null;
        })}

        {/* Draft */}
        {isDrawing && edit.tool === "polygon" && edit.draft.length > 0 && (
          <g>
            <polyline
              points={edit.draft
                .map(([x, y]) => {
                  const p = ctx.toPx(x, y);
                  return `${p.x},${p.y}`;
                })
                .join(" ")}
              fill="none"
              stroke={DRAFT_COLOR}
              strokeWidth={2}
              strokeDasharray="4 4"
            />
            {edit.draft.map(([x, y], i) => {
              const p = ctx.toPx(x, y);
              return <circle key={i} cx={p.x} cy={p.y} r={4} fill={DRAFT_COLOR} />;
            })}
          </g>
        )}
      </svg>

      {hover && propsById[hover.id] && (
        <Tooltip
          x={hover.x}
          y={hover.y}
          containerW={ctx.width}
          containerH={ctx.height}
          property={propsById[hover.id]}
          contracts={contractsByProp[hover.id]}
          ahchContracts={ahchByProp?.[hover.id]}
        />
      )}
    </>
  );
}

function Tooltip({
  x,
  y,
  containerW,
  containerH,
  property,
  contracts = [],
  ahchContracts = [],
}: {
  x: number;
  y: number;
  containerW: number;
  containerH: number;
  property: PropertyLite;
  contracts?: ActiveContractLite[];
  ahchContracts?: ActiveContractLite[];
}) {
  const W = 240;
  const left = Math.min(x + 12, containerW - W - 4);
  const top = Math.min(y + 12, containerH - 140);
  const area = property.area_total || 0;
  const baseRate = property.base_rate || 0;
  const baseTotal = area * baseRate;

  const occupied = contracts.reduce((sum, c) => sum + (c.area ?? area), 0);
  const free = Math.max(0, area - occupied);
  const freePct = area > 0 ? Math.round((free / area) * 100) : 0;
  // Суммарный доход по активным договорам аренды, приведённый к месяцу.
  const monthlyIncome = contracts.reduce(
    (sum, c) => sum + monthlyPayment(c.rate, c.payment_period, c.area ?? area),
    0,
  );
  const singleFull =
    contracts.length === 1 && (contracts[0].area === null || (contracts[0].area ?? 0) >= area);
  const showOccupancy = contracts.length > 0 && !singleFull;
  const ahchArea = ahchContracts.reduce((sum, c) => sum + (c.area ?? 0), 0);
  const ahchPct = area > 0 ? Math.round((ahchArea / area) * 100) : 0;

  const firstContract = contracts[0];
  const conRate = firstContract?.rate || 0;
  const conArea = firstContract?.area ?? area;
  const conTotal = conRate * conArea;

  return (
    <div
      className="absolute z-10 pointer-events-none rounded-md border bg-background/95 backdrop-blur shadow-lg p-2.5 text-[10px] leading-tight space-y-1"
      style={{ left: Math.max(4, left), top: Math.max(4, top), width: W }}
    >
      <div className="font-semibold text-xs truncate">{property.name}</div>
      <div className="text-muted-foreground truncate text-[10px]">{property.address}</div>
      <div className="flex justify-between gap-2">
        <span className="text-muted-foreground">Площадь</span>
        <span className="font-medium">{area} м²</span>
      </div>
      {baseRate > 0 && (
        <>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Базовая ставка</span>
            <span className="font-medium">{fmt(baseRate, property.currency)}/м²</span>
          </div>
          {area > 0 && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Базовый платёж</span>
              <span className="font-medium">{fmt(baseTotal, property.currency)}</span>
            </div>
          )}
        </>
      )}
      {showOccupancy && (
        <div className="flex justify-between gap-2 text-[10px]">
          <span className="text-muted-foreground">Свободно</span>
          <span className="font-medium">
            {free} м² ({freePct}%)
          </span>
        </div>
      )}
      {contracts.length > 0 && monthlyIncome > 0 && (
        <div className="flex justify-between gap-2 text-[10px]">
          <span className="text-muted-foreground">Доход (актив. договоры)</span>
          <span className="font-semibold text-primary">
            {fmt(monthlyIncome, contracts[0].currency)}/мес
          </span>
        </div>
      )}
      {ahchArea > 0 && (
        <div className="flex justify-between gap-2 text-[10px]">
          <span className="text-muted-foreground">АХЧ</span>
          <span className="font-medium">
            {ahchArea} м² ({ahchPct}%)
          </span>
        </div>
      )}
      {contracts.length > 0 && (
        <div className="border-t pt-1.5 mt-1.5 space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-primary">
            {contracts.length === 1 ? "Активный договор" : "Активные договоры"}
          </div>
          {contracts.map((c) => {
            const cArea = c.area ?? area;
            const pct = area > 0 ? Math.round((cArea / area) * 100) : 0;
            const monthPay = monthlyPayment(c.rate, c.payment_period, cArea);
            return (
              <div key={c.id} className="space-y-0.5">
                <div className="flex justify-between gap-1 text-[10px]">
                  <span className="truncate text-muted-foreground">{c.tenantName || "—"}</span>
                  <span className="font-medium shrink-0">
                    {cArea} м² ({pct}%)
                  </span>
                </div>
                <div className="flex justify-between gap-1 text-[10px]">
                  <span className="text-muted-foreground">Месячный платёж</span>
                  <span className="font-medium shrink-0">{fmt(monthPay, c.currency)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
