import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, ChevronRight, Sparkles, Trophy } from "lucide-react";

/**
 * Gamified onboarding "quest" for new accounts.
 *
 * - Skippable at any time; state persisted per-user in localStorage (no DB
 *   migration needed, matching the app's other client-side flags).
 * - Owner steps auto-complete from real data (created a property / tenant /
 *   contract); explore-steps complete when the user opens the section.
 * - Shown only to genuinely new accounts (recent `profiles.created_at`) that
 *   haven't finished/skipped it — existing users are never nagged.
 */

type Counts = { properties: number; tenants: number; contracts: number };
type QuestState = { dismissed?: boolean; completedAt?: string; visited?: string[] };

type StepDef = {
  id: string;
  title: string;
  desc: string;
  cta: string;
  to: string;
  kind: "data" | "visit";
  dataDone?: (c: Counts) => boolean;
};

const OWNER_STEPS: StepDef[] = [
  {
    id: "property",
    kind: "data",
    title: "Добавьте первый объект",
    desc: "Помещение, которое вы сдаёте в аренду.",
    cta: "Создать объект",
    to: "/properties/new",
    dataDone: (c) => c.properties > 0,
  },
  {
    id: "tenant",
    kind: "data",
    title: "Заведите арендатора",
    desc: "Компания или человек, который снимает помещение.",
    cta: "Добавить арендатора",
    to: "/tenants/new",
    dataDone: (c) => c.tenants > 0,
  },
  {
    id: "contract",
    kind: "data",
    title: "Оформите договор",
    desc: "Свяжите объект и арендатора условиями аренды.",
    cta: "Создать договор",
    to: "/contracts/new",
    dataDone: (c) => c.contracts > 0,
  },
  {
    id: "tasks",
    kind: "visit",
    title: "Загляните в «Задачи»",
    desc: "ИИ подскажет задачи из чатов с арендаторами.",
    cta: "Открыть задачи",
    to: "/tasks",
  },
];

const TENANT_STEPS: StepDef[] = [
  {
    id: "me-contracts",
    kind: "visit",
    title: "Посмотрите свои договоры",
    desc: "Все условия аренды в одном месте.",
    cta: "Мои договоры",
    to: "/me/contracts",
  },
  {
    id: "me-charges",
    kind: "visit",
    title: "Проверьте начисления",
    desc: "Что и когда нужно оплатить.",
    cta: "Начисления",
    to: "/me/charges",
  },
  {
    id: "me-chat",
    kind: "visit",
    title: "Напишите управляющему",
    desc: "Вопросы и заявки — прямо в чат.",
    cta: "Открыть чат",
    to: "/me/chat",
  },
];

const NEW_ACCOUNT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function storageKey(uid: string) {
  return `onboarding.v1.${uid}`;
}
function readState(uid: string): QuestState {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(storageKey(uid)) || "{}") as QuestState;
  } catch {
    return {};
  }
}
function writeState(uid: string, s: QuestState) {
  if (typeof window !== "undefined") localStorage.setItem(storageKey(uid), JSON.stringify(s));
}

function levelName(done: number, total: number): string {
  if (done >= total) return "Мастер";
  if (done === 0) return "Новичок";
  if (done < total / 2) return "Ученик";
  return "Уверенный пользователь";
}

export function OnboardingQuest({ variant }: { variant: "owner" | "tenant" }) {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [state, setState] = useState<QuestState>({});
  const [ready, setReady] = useState(false);
  const isDemo = typeof window !== "undefined" && !!localStorage.getItem("demo.kind");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const id = data.user?.id ?? null;
      setUid(id);
      setState(id ? readState(id) : {});
      if (id) {
        const { data: p } = await supabase
          .from("profiles")
          .select("created_at")
          .eq("id", id)
          .maybeSingle();
        if (active) setCreatedAt(p?.created_at ?? null);
      }
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const steps = variant === "owner" ? OWNER_STEPS : TENANT_STEPS;

  const { data: counts, isLoading: countsLoading } = useQuery({
    queryKey: ["onboarding-counts"],
    enabled: ready && variant === "owner" && !!uid && !isDemo,
    staleTime: 10_000,
    queryFn: async (): Promise<Counts> => {
      const [p, t, c] = await Promise.all([
        supabase.from("properties").select("id", { count: "exact", head: true }),
        supabase.from("tenants").select("id", { count: "exact", head: true }),
        supabase.from("contracts").select("id", { count: "exact", head: true }),
      ]);
      return { properties: p.count ?? 0, tenants: t.count ?? 0, contracts: c.count ?? 0 };
    },
  });

  const update = (patch: QuestState) => {
    if (!uid) return;
    const next = { ...state, ...patch };
    setState(next);
    writeState(uid, next);
  };

  const stepDone = (s: StepDef): boolean =>
    s.kind === "data" ? !!counts && !!s.dataDone?.(counts) : (state.visited ?? []).includes(s.id);

  const doneCount = steps.filter(stepDone).length;
  const total = steps.length;
  const allDone = doneCount === total;
  const pct = Math.round((doneCount / total) * 100);

  // --- visibility gate: only genuinely new, un-dismissed accounts ---
  if (!ready || !uid || isDemo || state.dismissed || state.completedAt) return null;
  if (variant === "owner" && (countsLoading || !counts)) return null;
  const hasProgress = allDone || (state.visited?.length ?? 0) > 0 || doneCount > 0;
  const isNew = createdAt
    ? Date.now() - new Date(createdAt).getTime() < NEW_ACCOUNT_WINDOW_MS
    : true;
  if (!isNew && !hasProgress) return null;

  const go = (s: StepDef) => {
    if (s.kind === "visit" && !(state.visited ?? []).includes(s.id)) {
      update({ visited: [...(state.visited ?? []), s.id] });
    }
    navigate({ to: s.to });
  };

  if (allDone) {
    return (
      <Card className="border-primary/40 bg-gradient-to-br from-primary/10 to-transparent">
        <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
          <Trophy className="h-10 w-10 text-primary animate-bounce" />
          <div className="text-lg font-semibold">Обучение пройдено! 🎉</div>
          <p className="max-w-md text-sm text-muted-foreground">
            Вы освоили основные шаги. Уровень: <span className="font-medium">Мастер</span> ·{" "}
            {total * 100} XP.
          </p>
          <Button
            className="mt-1"
            onClick={() => update({ completedAt: new Date().toISOString() })}
          >
            Отлично!
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Квест новичка
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Пройдите {total} шага, чтобы освоить систему.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="secondary" className="whitespace-nowrap">
              {levelName(doneCount, total)}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{doneCount * 100} XP</span>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Progress value={pct} className="h-2" />
          <span className="text-xs tabular-nums text-muted-foreground">
            {doneCount}/{total}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((s) => {
          const done = stepDone(s);
          return (
            <div
              key={s.id}
              className={cn(
                "flex items-center gap-3 rounded-md border p-3",
                done ? "border-primary/30 bg-primary/5" : "bg-background",
              )}
            >
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/40 text-transparent",
                )}
                aria-hidden
              >
                <Check className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn("text-sm font-medium", done && "line-through opacity-70")}>
                  {s.title}
                </div>
                <div className="truncate text-xs text-muted-foreground">{s.desc}</div>
              </div>
              {!done && (
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => go(s)}>
                  {s.cta}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => update({ dismissed: true })}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Пропустить обучение
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
