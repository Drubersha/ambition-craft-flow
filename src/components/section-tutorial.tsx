import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Confetti } from "@/components/confetti";
import { cn } from "@/lib/utils";
import {
  Building2,
  Check,
  ChevronRight,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  MessageSquare,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  Trophy,
  User as UserIcon,
  Users,
  Wallet,
  CalendarDays,
  Files,
  Receipt,
  Gauge,
} from "lucide-react";

/**
 * Per-section tutorials in the same style as the main onboarding quest
 * (progress bar, check circles, confetti). Launched from the FAQ page;
 * the active tutorial is rendered at the top of its section by AppShell.
 * State is per-user in localStorage, like the quest's local mirror.
 */

export type SectionTutorial = {
  id: string;
  /** Route the tutorial belongs to (longest prefix wins). */
  route: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Which role sees this tutorial in the FAQ list. */
  roles: ("owner" | "tenant")[];
  steps: { title: string; desc: string }[];
};

export const SECTION_TUTORIALS: SectionTutorial[] = [
  {
    id: "dashboard",
    route: "/dashboard",
    label: "Дашборд",
    icon: LayoutDashboard,
    roles: ["owner"],
    steps: [
      {
        title: "Ключевые показатели",
        desc: "Вверху — сводка по портфелю: площадь, число объектов, заполняемость и арендные платежи за месяц.",
      },
      {
        title: "Деньги и долги",
        desc: "Карточки «Доход», «Расходы» и «Долги 30+ дней» показывают финансовую картину месяца. Красное — повод открыть «Оплаты».",
      },
      {
        title: "Таблицы ниже",
        desc: "Ниже — объекты и ближайшие события. Клик по строке ведёт в карточку объекта или договора.",
      },
    ],
  },
  // «Воронка» временно закрыта (в разработке, ждёт интеграций Авито/Циан) —
  // обучение по ней скрыто из FAQ до открытия раздела.
  {
    id: "properties",
    route: "/properties",
    label: "Объекты",
    icon: Building2,
    roles: ["owner"],
    steps: [
      {
        title: "Список и папки",
        desc: "Вкладка «Список» — все помещения, «Папки» — группировка по территориям или зданиям.",
      },
      {
        title: "Создайте объект",
        desc: "Кнопка «Добавить»: название, адрес, площадь и ставка. Объект затем связывается с договорами.",
      },
      {
        title: "Планы территории",
        desc: "В папке можно загрузить план (PNG, JPG, WEBP, PDF) и размечать на нём объекты.",
      },
    ],
  },
  {
    id: "tenants",
    route: "/tenants",
    label: "Арендаторы",
    icon: Users,
    roles: ["owner"],
    steps: [
      {
        title: "Карточки арендаторов",
        desc: "Компании и люди, снимающие ваши помещения: контакты, реквизиты, привязанные договоры.",
      },
      {
        title: "Добавьте арендатора",
        desc: "Кнопка «Добавить»: имя/название, телефон, e-mail. E-mail позволит арендатору войти в свой кабинет.",
      },
      {
        title: "Связь с договорами",
        desc: "Из карточки арендатора видно его договоры, начисления и переписку.",
      },
    ],
  },
  {
    id: "contracts",
    route: "/contracts",
    label: "Договоры",
    icon: FileText,
    roles: ["owner"],
    steps: [
      {
        title: "Список договоров",
        desc: "Все действующие и завершённые договоры аренды с статусами и сроками.",
      },
      {
        title: "Новый договор",
        desc: "Кнопка «Новый договор» связывает объект и арендатора: ставка, период, условия индексации.",
      },
      {
        title: "Счётчики в договоре",
        desc: "В форме договора добавьте счётчики помещения: тип, заводской номер и начальное показание (для б/у — текущее). При сохранении без счётчиков система переспросит.",
      },
      {
        title: "Начисления из договора",
        desc: "По договору автоматически создаются начисления — они появятся в разделе «Оплаты».",
      },
    ],
  },
  {
    id: "utilities",
    route: "/utilities",
    label: "Коммуналка",
    icon: Gauge,
    roles: ["owner"],
    steps: [
      {
        title: "Реестр счётчиков",
        desc: "Вкладка «Счётчики»: счётчики арендаторов (из договоров) и ваши общие на группу объектов — кнопка «Добавить счётчик».",
      },
      {
        title: "Показания",
        desc: "Арендаторы передают показания в своём кабинете, вы можете вносить любые сами. Показание не может быть меньше предыдущего.",
      },
      {
        title: "Компенсация затрат",
        desc: "Вкладка «Компенсация»: укажите общий счёт за период — система распределит его по счётчикам, остаток по площади, создаст начисления и запишет расход в бюджет папки.",
      },
      {
        title: "Аналитика и алерты",
        desc: "Вкладка «Аналитика»: динамика потребления, сравнение общих счётчиков с арендаторскими. При отклонении расхода от сезонной нормы на 30%+ придёт уведомление.",
      },
    ],
  },
  {
    id: "payments",
    route: "/payments",
    label: "Оплаты",
    icon: Wallet,
    roles: ["owner"],
    steps: [
      {
        title: "Начисления и оплаты",
        desc: "Что и когда должны заплатить арендаторы, и что уже оплачено.",
      },
      {
        title: "Статусы",
        desc: "Следите за просрочками: долги подсвечиваются, а «Долги 30+ дней» видны и на дашборде.",
      },
      {
        title: "Фиксация оплаты",
        desc: "Отмечайте поступившие платежи — остаток по начислению пересчитается автоматически.",
      },
    ],
  },
  {
    id: "budgets",
    route: "/budgets",
    label: "Бюджет",
    icon: PiggyBank,
    roles: ["owner"],
    steps: [
      {
        title: "План на папку",
        desc: "Бюджет ведётся по папкам объектов: создайте план и статьи расходов с лимитами.",
      },
      {
        title: "Расходы периода",
        desc: "Добавляйте траты в статьи — прогресс и предупреждения о перерасходе считаются автоматически.",
      },
      {
        title: "Прошлые периоды",
        desc: "Селектор периода сверху позволяет вносить расходы и плановые значения задним числом — для аналитики.",
      },
    ],
  },
  {
    id: "tasks",
    route: "/tasks",
    label: "Задачи",
    icon: KanbanSquare,
    roles: ["owner"],
    steps: [
      {
        title: "Доска задач",
        desc: "Задачи по объектам: принято, в работе, на проверке, готово. Перетаскивайте карточки между колонками.",
      },
      {
        title: "Подсказки ИИ",
        desc: "Из сообщений арендаторов в чате ИИ предлагает задачи — принимайте или отклоняйте предложения.",
      },
      {
        title: "Создание вручную",
        desc: "Задачу можно завести и вручную: название, описание, приоритет.",
      },
    ],
  },
  {
    id: "chats",
    route: "/chats",
    label: "Чаты",
    icon: MessageSquare,
    roles: ["owner"],
    steps: [
      {
        title: "Переписка с арендаторами",
        desc: "Каждому арендатору — свой чат. Новые сообщения приходят и уведомлением на почту.",
      },
      {
        title: "Вложения",
        desc: "К сообщениям можно прикладывать фото — например, фото поломки.",
      },
      {
        title: "Из сообщения — задача",
        desc: "ИИ распознаёт заявки в сообщениях и предлагает создать задачу в разделе «Задачи».",
      },
    ],
  },
  {
    id: "users",
    route: "/users",
    label: "Пользователи",
    icon: ShieldCheck,
    roles: ["owner"],
    steps: [
      {
        title: "Роли и доступ",
        desc: "Здесь видно, кто имеет доступ к вашим данным: менеджеры и арендаторы.",
      },
      {
        title: "Менеджеры",
        desc: "Пригласите менеджера — он будет работать с вашими объектами от своего аккаунта.",
      },
    ],
  },
  {
    id: "me",
    route: "/me",
    label: "Мой кабинет",
    icon: UserIcon,
    roles: ["tenant"],
    steps: [
      {
        title: "Сводка арендатора",
        desc: "Главная страница кабинета: ваши договоры, ближайшие платежи и уведомления.",
      },
      {
        title: "Навигация",
        desc: "Слева — разделы кабинета: договоры, начисления, календарь оплат, документы и чат.",
      },
    ],
  },
  {
    id: "me-contracts",
    route: "/me/contracts",
    label: "Мои договоры",
    icon: FileText,
    roles: ["tenant"],
    steps: [
      {
        title: "Условия аренды",
        desc: "Все ваши договоры: объект, ставка, срок действия и статус.",
      },
    ],
  },
  {
    id: "me-charges",
    route: "/me/charges",
    label: "Начисления",
    icon: Receipt,
    roles: ["tenant"],
    steps: [
      {
        title: "Что оплатить",
        desc: "Список начислений с суммами и сроками. Просроченные подсвечиваются.",
      },
    ],
  },
  {
    id: "me-meters",
    route: "/me/meters",
    label: "Счётчики",
    icon: Gauge,
    roles: ["tenant"],
    steps: [
      {
        title: "Передача показаний",
        desc: "Раз в месяц вносите текущие показания по каждому счётчику. Значение не может быть меньше предыдущего.",
      },
      {
        title: "История",
        desc: "Под каждым счётчиком — история показаний с расходом за интервал. По этим данным арендодатель рассчитает компенсацию коммуналки.",
      },
    ],
  },
  {
    id: "me-calendar",
    route: "/me/calendar",
    label: "Календарь оплат",
    icon: CalendarDays,
    roles: ["tenant"],
    steps: [
      {
        title: "Платежи по датам",
        desc: "Календарь показывает, когда наступают сроки оплат.",
      },
    ],
  },
  {
    id: "me-documents",
    route: "/me/documents",
    label: "Документы",
    icon: Files,
    roles: ["tenant"],
    steps: [
      {
        title: "Файлы по аренде",
        desc: "Договоры и другие документы, которыми поделился арендодатель.",
      },
    ],
  },
  {
    id: "me-chat",
    route: "/me/chat",
    label: "Чат",
    icon: MessageSquare,
    roles: ["tenant"],
    steps: [
      {
        title: "Связь с управляющим",
        desc: "Вопросы и заявки пишите в чат — можно прикладывать фото. Из заявок управляющий создаёт задачи.",
      },
    ],
  },
];

type SectionState = { step?: number; completedAt?: string; dismissed?: boolean };
type TutorialState = Record<string, SectionState>;

function storageKey(uid: string) {
  return `sectionTutorials.v1.${uid}`;
}
function readState(uid: string): TutorialState {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(storageKey(uid)) || "{}") as TutorialState;
  } catch {
    return {};
  }
}
function writeState(uid: string, s: TutorialState) {
  if (typeof window !== "undefined") localStorage.setItem(storageKey(uid), JSON.stringify(s));
}

/** Start (or restart) a section tutorial; it renders on the section's page. */
export async function startSectionTutorial(sectionId: string): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return;
  const s = readState(uid);
  writeState(uid, { ...s, [sectionId]: { step: 0 } });
}

/** Completion map for the FAQ list (sectionId -> completed). */
export async function getSectionTutorialState(): Promise<TutorialState> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  return uid ? readState(uid) : {};
}

/** The tutorial whose route best matches the pathname (longest prefix). */
function tutorialForPath(pathname: string): SectionTutorial | null {
  let best: SectionTutorial | null = null;
  for (const t of SECTION_TUTORIALS) {
    const matches = pathname === t.route || pathname.startsWith(t.route + "/");
    if (matches && (!best || t.route.length > best.route.length)) best = t;
  }
  return best;
}

/** Active tutorial card, rendered by AppShell above the page content. */
export function SectionTutorialCard({ pathname }: { pathname: string }) {
  const [uid, setUid] = useState<string | null>(null);
  const [state, setState] = useState<TutorialState>({});

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setUid(id);
      setState(id ? readState(id) : {});
    });
    return () => {
      active = false;
    };
  }, [pathname]);

  const tutorial = tutorialForPath(pathname);
  if (!tutorial || !uid) return null;
  const s = state[tutorial.id];
  // Render only when explicitly started from FAQ and not finished/skipped.
  if (!s || s.step === undefined || s.completedAt || s.dismissed) return null;

  const update = (patch: SectionState) => {
    const next = { ...state, [tutorial.id]: { ...s, ...patch } };
    setState(next);
    writeState(uid, next);
  };

  const total = tutorial.steps.length;
  const step = Math.min(s.step, total);
  const allDone = step >= total;
  const pct = Math.round((step / total) * 100);
  const Icon = tutorial.icon;

  if (allDone) {
    return (
      <Card className="relative mb-4 overflow-hidden border-primary/40 bg-gradient-to-br from-primary/10 to-transparent">
        <Confetti />
        <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
          <Trophy className="h-10 w-10 text-primary animate-bounce" />
          <div className="text-lg font-semibold">Обучение по разделу пройдено! 🎉</div>
          <p className="max-w-md text-sm text-muted-foreground">
            Вы освоили раздел «{tutorial.label}». Другие обучения — в «FAQ и помощь».
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
    <Card className="mb-4 border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Обучение: {tutorial.label}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Короткий разбор раздела — {total} {total === 1 ? "шаг" : total < 5 ? "шага" : "шагов"}
              .
            </p>
          </div>
          <Badge variant="secondary" className="whitespace-nowrap">
            <Icon className="mr-1 h-3 w-3" />
            Шаг {Math.min(step + 1, total)}/{total}
          </Badge>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Progress value={pct} className="h-2" />
          <span className="text-xs tabular-nums text-muted-foreground">
            {step}/{total}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {tutorial.steps.map((st, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 rounded-md border p-3",
                done ? "border-primary/30 bg-primary/5" : "bg-background",
                current && "border-primary/50",
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
                  {st.title}
                </div>
                <div className={cn("text-xs text-muted-foreground", !current && "truncate")}>
                  {st.desc}
                </div>
              </div>
              {current && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => update({ step: step + 1 })}
                >
                  Понятно
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
