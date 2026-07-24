/** Мелкие UI-примитивы дашборда: секция, KPI-карточка, мультиселект-фильтр, заглушки. */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, Info } from "lucide-react";
import { toneClass } from "@/lib/dashboard";

export function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/**
 * Секция «под катом»: заголовок-кнопка, тело монтируется только когда открыто.
 * Ленивый монтаж не даёт тяжёлым графикам и таблицам рендериться, пока раздел
 * свёрнут, — первый экран дашборда остаётся лёгким.
 */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        {title}
      </button>
      {open && children}
    </section>
  );
}

export function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  hint,
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "ok" | "warn" | "danger";
  hint?: string;
}) {
  const card = (
    <Card className={hint ? "cursor-help" : undefined}>
      <CardContent className="p-2.5">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        <div className={`mt-0.5 text-base sm:text-lg font-bold break-words ${toneClass(tone)}`}>
          {value}
        </div>
        {sub}
      </CardContent>
    </Card>
  );
  if (!hint) return card;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>{card}</div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">{hint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Разбивка KPI по контурам под основной цифрой: у контуров разные единицы
 * (м², места, ₽/место), поэтому каждый показывается своей строкой.
 */
export function ContourBreakdown({
  items,
  className,
}: {
  items: { label: string; text: string }[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={`mt-1 space-y-0.5 ${className ?? ""}`}>
      {items.map((i) => (
        <div key={i.label} className="text-[11px] text-muted-foreground">
          {i.label}: {i.text}
        </div>
      ))}
    </div>
  );
}

export function MultiSelectPopover({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const visible = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          {label}
          {value.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {value.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 space-y-2">
        <Input
          placeholder="Поиск…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8"
        />
        <div className="max-h-64 overflow-auto space-y-1">
          {visible.length === 0 && (
            <div className="text-xs text-muted-foreground p-2">Ничего не найдено</div>
          )}
          {visible.map((o) => {
            const checked = value.includes(o.value);
            return (
              <label
                key={o.value}
                className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-accent cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    if (checked) onChange(value.filter((v) => v !== o.value));
                    else onChange([...value, o.value]);
                  }}
                />
                <span className="truncate">{o.label}</span>
              </label>
            );
          })}
        </div>
        {value.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
            Очистить
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function PlaceholderCard({ title, text }: { title: string; text: string }) {
  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <EmptyText text={text} />
      </CardContent>
    </Card>
  );
}

export function EmptyText({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground py-6 text-center">{text}</div>;
}
