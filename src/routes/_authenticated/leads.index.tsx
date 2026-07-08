import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Check,
  X,
  Phone,
  Mail,
  Building2,
  RotateCcw,
  Construction,
  MessageSquarePlus,
} from "lucide-react";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/leads/")({
  component: LeadsUnderConstruction,
});

/** Диагональная «строительная лента» (жёлто-чёрные полосы). */
function ConstructionTape({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-8 w-[120%] -mx-[10%] shadow-md ${className}`}
      style={{
        background: "repeating-linear-gradient(45deg, #facc15 0 24px, #1c1917 24px 48px)",
      }}
    />
  );
}

/**
 * Раздел временно закрыт: воронка вернётся вместе с интеграциями Авито/Циан.
 * Код самой воронки (LeadsPage ниже) сохранён и снова станет роутом, когда
 * интеграции будут готовы.
 */
function LeadsUnderConstruction() {
  return (
    <div className="relative overflow-hidden py-6">
      <ConstructionTape className="rotate-[-3deg] mb-10" />
      <Card className="mx-auto max-w-xl p-8 text-center space-y-4 border-yellow-400/60">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-yellow-400/15 text-yellow-500">
          <Construction className="h-7 w-7" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold">Раздел «Воронка» в разработке</h1>
        <p className="text-sm text-muted-foreground">
          Мы готовим воронку заявок к запуску: планируется интеграция с{" "}
          <span className="font-medium text-foreground">Авито</span> и{" "}
          <span className="font-medium text-foreground">Циан</span> — обращения с площадок будут
          попадать сюда автоматически.
        </p>
        <Button asChild className="w-full sm:w-auto">
          <Link to="/faq">
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            Если необходимы ещё какие-либо интеграции — напишите сюда
          </Link>
        </Button>
      </Card>
      <ConstructionTape className="rotate-[3deg] mt-10" />
    </div>
  );
}

type LeadStage = "inquiry" | "viewing" | "documents" | "contract_sent" | "signed";
type LeadStatus = "active" | "archived" | "won";
type LeadSource = "avito" | "cian" | "yandex" | "referral" | "website" | "other";

const STAGES: { key: LeadStage; title: string; short: string }[] = [
  { key: "inquiry", title: "Спросил в агрегаторе", short: "Запрос" },
  { key: "viewing", title: "Приехал посмотреть", short: "Просмотр" },
  { key: "documents", title: "Дал документы (ИНН)", short: "Документы" },
  { key: "contract_sent", title: "Получил договор", short: "На подписи" },
  { key: "signed", title: "Вернул подписанный", short: "Подписан" },
];

const SOURCE_LABELS: Record<LeadSource, string> = {
  avito: "Avito",
  cian: "Циан",
  yandex: "Яндекс.Недвижимость",
  referral: "Рекомендация",
  website: "Сайт",
  other: "Другое",
};

type Lead = {
  id: string;
  owner_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  inn: string | null;
  source: LeadSource;
  budget: number | null;
  desired_area: number | null;
  property_id: string;
  stage: LeadStage;
  status: LeadStatus;
  archived_reason: string | null;
  notes: string | null;
  tenant_id: string | null;
  contract_id: string | null;
  property?: { name: string; currency: string } | null;
};

function nextStage(s: LeadStage): LeadStage | null {
  const i = STAGES.findIndex((x) => x.key === s);
  if (i < 0 || i >= STAGES.length - 1) return null;
  return STAGES[i + 1].key;
}

function LeadsPage() {
  const [filter, setFilter] = useState<"active" | "archived">("active");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads", filter],
    queryFn: async () => {
      const q = supabase
        .from("leads" as any)
        .select("*, property:properties(name, currency)")
        .order("created_at", { ascending: false });
      const { data, error } =
        filter === "active" ? await q.eq("status", "active") : await q.neq("status", "active");
      if (error) throw error;
      return (data ?? []) as unknown as Lead[];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold">Воронка продаж</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Новый лид
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as "active" | "archived")}>
        <TabsList>
          <TabsTrigger value="active">Активные</TabsTrigger>
          <TabsTrigger value="archived">Архив</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div>Загрузка...</div>
      ) : filter === "archived" ? (
        <ArchiveList leads={leads ?? []} />
      ) : (
        <Kanban leads={leads ?? []} />
      )}

      <LeadFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function Kanban({ leads }: { leads: Lead[] }) {
  const grouped = useMemo(() => {
    const m: Record<LeadStage, Lead[]> = {
      inquiry: [],
      viewing: [],
      documents: [],
      contract_sent: [],
      signed: [],
    };
    for (const l of leads) m[l.stage].push(l);
    return m;
  }, [leads]);

  return (
    <div className="overflow-x-auto -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6">
      <div className="flex gap-3 min-w-max pb-2">
        {STAGES.map((s) => (
          <div key={s.key} className="w-72 shrink-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="text-sm font-semibold">{s.title}</div>
              <Badge variant="secondary">{grouped[s.key].length}</Badge>
            </div>
            <div className="space-y-2">
              {grouped[s.key].length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-md">
                  Пусто
                </div>
              ) : (
                grouped[s.key].map((l) => <LeadCard key={l.id} lead={l} />)
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  const qc = useQueryClient();
  const [failOpen, setFailOpen] = useState(false);
  const [innOpen, setInnOpen] = useState(false);
  const [signedOpen, setSignedOpen] = useState(false);

  const advance = useMutation({
    mutationFn: async (vars: { inn?: string }) => {
      const next = nextStage(lead.stage);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Не авторизован");

      if (lead.stage === "signed") {
        // Final: create tenant + draft contract
        const { data: tenant, error: tErr } = await supabase
          .from("tenants")
          .insert({
            owner_id: u.user.id,
            name: lead.full_name,
            kind: "person",
            phone: lead.phone,
            email: lead.email,
            inn: lead.inn,
          })
          .select("id")
          .single();
        if (tErr) throw tErr;

        const today = new Date().toISOString().slice(0, 10);
        const { data: prop } = await supabase
          .from("properties")
          .select("base_rate, area_total, currency")
          .eq("id", lead.property_id)
          .single();

        const { data: contract, error: cErr } = await supabase
          .from("contracts")
          .insert({
            owner_id: u.user.id,
            tenant_id: tenant.id,
            property_id: lead.property_id,
            kind: "rent",
            status: "draft",
            start_date: today,
            rate: Number(prop?.base_rate ?? lead.budget ?? 0),
            area: Number(lead.desired_area ?? prop?.area_total ?? 0),
            currency: prop?.currency ?? "RUB",
            payment_period: "monthly",
          })
          .select("id")
          .single();
        if (cErr) throw cErr;

        const { error: uErr } = await supabase
          .from("leads" as any)
          .update({
            status: "won",
            tenant_id: tenant.id,
            contract_id: contract.id,
          })
          .eq("id", lead.id);
        if (uErr) throw uErr;

        await supabase.from("lead_events" as any).insert({
          lead_id: lead.id,
          owner_id: u.user.id,
          from_stage: lead.stage,
          to_stage: lead.stage,
          passed: true,
          comment: "Завершено: создан арендатор и черновик договора",
        });
        return { kind: "won" as const, tenantId: tenant.id, contractId: contract.id };
      }

      if (!next) throw new Error("Нет следующего этапа");
      const patch: Record<string, unknown> = { stage: next };
      if (vars.inn) patch.inn = vars.inn;

      const { error } = await supabase
        .from("leads" as any)
        .update(patch)
        .eq("id", lead.id);
      if (error) throw error;
      await supabase.from("lead_events" as any).insert({
        lead_id: lead.id,
        owner_id: u.user.id,
        from_stage: lead.stage,
        to_stage: next,
        passed: true,
      });
      return { kind: "advanced" as const };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      if (res.kind === "won") {
        toast.success("Лид закрыт: создан арендатор и черновик договора");
        qc.invalidateQueries({ queryKey: ["tenants"] });
        qc.invalidateQueries({ queryKey: ["contracts"] });
      } else {
        toast.success("Этап пройден");
      }
    },
    onError: (e: Error) => toast.error(e.message || "Не удалось"),
  });

  function handlePass() {
    // Transition documents -> contract_sent requires INN
    if (lead.stage === "documents" && !lead.inn) {
      setInnOpen(true);
      return;
    }
    if (lead.stage === "signed") {
      setSignedOpen(true);
      return;
    }
    advance.mutate({});
  }

  return (
    <>
      <Card className="p-3 space-y-2">
        <div className="font-medium text-sm break-words">{lead.full_name}</div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[10px]">
            {SOURCE_LABELS[lead.source]}
          </Badge>
          {lead.budget != null && (
            <Badge variant="outline" className="text-[10px]">
              {formatMoney(lead.budget, lead.property?.currency ?? "RUB")}
            </Badge>
          )}
          {lead.desired_area != null && (
            <Badge variant="outline" className="text-[10px]">
              {lead.desired_area} м²
            </Badge>
          )}
        </div>
        {lead.property && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="break-words">{lead.property.name}</span>
          </div>
        )}
        {lead.phone && (
          <a
            href={`tel:${lead.phone}`}
            className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
          >
            <Phone className="h-3 w-3" /> {lead.phone}
          </a>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground truncate"
          >
            <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{lead.email}</span>
          </a>
        )}
        {lead.inn && <div className="text-xs text-muted-foreground">ИНН: {lead.inn}</div>}

        <div className="flex gap-1 pt-1">
          <Button
            size="sm"
            className="flex-1 h-8"
            onClick={handlePass}
            disabled={advance.isPending}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            {lead.stage === "signed" ? "Закрыть" : "Прошёл"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8"
            onClick={() => setFailOpen(true)}
            disabled={advance.isPending}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Не прошёл
          </Button>
        </div>
      </Card>

      <FailDialog open={failOpen} onOpenChange={setFailOpen} lead={lead} />
      <InnDialog
        open={innOpen}
        onOpenChange={setInnOpen}
        onSubmit={(inn) => {
          setInnOpen(false);
          advance.mutate({ inn });
        }}
      />
      <ConfirmSignedDialog
        open={signedOpen}
        onOpenChange={setSignedOpen}
        onConfirm={() => {
          setSignedOpen(false);
          advance.mutate({});
        }}
      />
    </>
  );
}

function FailDialog({
  open,
  onOpenChange,
  lead,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const text = reason.trim();
      if (text.length < 1) throw new Error("Укажите причину");
      if (text.length > 500) throw new Error("Слишком длинная причина");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Не авторизован");
      const { error } = await supabase
        .from("leads" as any)
        .update({
          status: "archived",
          archived_reason: text,
          archived_at: new Date().toISOString(),
        })
        .eq("id", lead.id);
      if (error) throw error;
      await supabase.from("lead_events" as any).insert({
        lead_id: lead.id,
        owner_id: u.user.id,
        from_stage: lead.stage,
        to_stage: lead.stage,
        passed: false,
        comment: text,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Лид перемещён в архив");
      onOpenChange(false);
      setReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Лид не прошёл этап</DialogTitle>
          <DialogDescription>Укажите причину — лид будет перемещён в архив.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Причина отказа"
          rows={4}
          maxLength={500}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Сохраняем..." : "В архив"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InnDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (inn: string) => void;
}) {
  const [inn, setInn] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    const v = inn.trim();
    if (!/^(\d{10}|\d{12})$/.test(v)) {
      setErr("ИНН должен содержать 10 или 12 цифр");
      return;
    }
    setErr(null);
    onSubmit(v);
    setInn("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Укажите ИНН</DialogTitle>
          <DialogDescription>
            Для перехода на этап «Получил договор» нужен ИНН арендатора (10 или 12 цифр).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            value={inn}
            onChange={(e) => setInn(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            maxLength={12}
            placeholder="1234567890"
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={submit}>Продолжить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmSignedDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Закрыть лид</DialogTitle>
          <DialogDescription>
            Будет создан арендатор и черновик договора на выбранный объект. Лид выйдет из воронки.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={onConfirm}>Подтвердить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const leadFormSchema = z.object({
  full_name: z.string().trim().min(1, "Обязательно").max(200),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  email: z.string().trim().email("Некорректный email").max(255).optional().or(z.literal("")),
  source: z.enum(["avito", "cian", "yandex", "referral", "website", "other"]),
  budget: z.string().optional(),
  desired_area: z.string().optional(),
  property_id: z.string().uuid("Выберите объект"),
  notes: z.string().max(2000).optional(),
});

function LeadFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [full_name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState<LeadSource>("avito");
  const [budget, setBudget] = useState("");
  const [desired_area, setArea] = useState("");
  const [property_id, setPropertyId] = useState<string>("");
  const [notes, setNotes] = useState("");

  const { data: properties } = useQuery({
    queryKey: ["properties-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, address")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  function reset() {
    setName("");
    setPhone("");
    setEmail("");
    setSource("avito");
    setBudget("");
    setArea("");
    setPropertyId("");
    setNotes("");
  }

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = leadFormSchema.safeParse({
        full_name,
        phone,
        email,
        source,
        budget,
        desired_area,
        property_id,
        notes,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.errors[0]?.message ?? "Проверьте поля");
      }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Не авторизован");

      const { error } = await supabase.from("leads" as any).insert({
        owner_id: u.user.id,
        full_name: parsed.data.full_name,
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
        source: parsed.data.source,
        budget: parsed.data.budget ? Number(parsed.data.budget) : null,
        desired_area: parsed.data.desired_area ? Number(parsed.data.desired_area) : null,
        property_id: parsed.data.property_id,
        notes: parsed.data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Лид добавлен");
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Новый лид</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>ФИО *</Label>
            <Input value={full_name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Телефон</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} />
            </div>
            <div className="grid gap-1">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Источник</Label>
            <Select value={source} onValueChange={(v) => setSource(v as LeadSource)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Бюджет, ₽/мес</Label>
              <Input
                type="number"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label>Площадь, м²</Label>
              <Input
                type="number"
                min="0"
                value={desired_area}
                onChange={(e) => setArea(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Объект *</Label>
            <Select value={property_id} onValueChange={setPropertyId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите объект" />
              </SelectTrigger>
              <SelectContent>
                {(properties ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Комментарий</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Сохраняем..." : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveList({ leads }: { leads: Lead[] }) {
  const qc = useQueryClient();
  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("leads" as any)
        .update({ status: "active", archived_reason: null, archived_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Лид восстановлен");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (leads.length === 0) {
    return (
      <Card className="p-12 text-center">
        <h3 className="font-semibold">Архив пуст</h3>
        <p className="text-sm text-muted-foreground">
          Закрытые лиды (отказы и выигранные) появятся здесь.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {leads.map((l) => (
        <Card key={l.id} className="p-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="font-medium text-sm break-words">{l.full_name}</div>
            <div className="flex flex-wrap gap-1">
              <Badge variant={l.status === "won" ? "default" : "secondary"} className="text-[10px]">
                {l.status === "won" ? "Выигран" : "Отказ"}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {SOURCE_LABELS[l.source]}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {STAGES.find((s) => s.key === l.stage)?.short}
              </Badge>
            </div>
            {l.property && <div className="text-xs text-muted-foreground">{l.property.name}</div>}
            {l.archived_reason && (
              <div className="text-xs text-muted-foreground break-words">
                Причина: {l.archived_reason}
              </div>
            )}
          </div>
          {l.status === "archived" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => restore.mutate(l.id)}
              disabled={restore.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Восстановить
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}
