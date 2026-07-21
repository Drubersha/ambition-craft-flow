/**
 * Инструменты ИИ-ассистента поверх доменных данных.
 *
 * Модель не считает цифры и не пишет SQL — она лишь выбирает инструмент и
 * параметры. Все расчёты и ссылки формирует код: так цифры всегда верны, а
 * ссылка ведёт ровно на ту запись, из которой взято число.
 */
import { z } from "zod";
import { formatMoney, formatDate, monthlyPayment, todayISO } from "@/lib/format";

/** Ссылка на запись в программе, из которой взяты данные ответа. */
export type AiLink = {
  label: string;
  /** Путь роутера, например "/contracts/$id". */
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
  /** Подпись справа — обычно сумма или дата. */
  note?: string;
};

export type AiToolResult = {
  /** Текстовая выжимка для модели: она формулирует ответ по ней. */
  summary: string;
  links: AiLink[];
};

type Ctx = {
  sb: any;
  ownerIds: string[];
};

/** Границы периода по названию месяца/квартала/года или явным датам. */
function resolvePeriod(period?: string, from?: string, to?: string): { from: string; to: string } {
  if (from && to) return { from, to };
  const now = new Date();
  const y = now.getFullYear();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const MONTHS: Record<string, number> = {
    январь: 0,
    января: 0,
    февраль: 1,
    февраля: 1,
    март: 2,
    марта: 2,
    апрель: 3,
    апреля: 3,
    май: 4,
    мая: 4,
    июнь: 5,
    июня: 5,
    июль: 6,
    июля: 6,
    август: 7,
    августа: 7,
    сентябрь: 8,
    сентября: 8,
    октябрь: 9,
    октября: 9,
    ноябрь: 10,
    ноября: 10,
    декабрь: 11,
    декабря: 11,
  };
  const p = (period ?? "").toLowerCase().trim();
  const yearMatch = p.match(/(20\d{2})/);
  const year = yearMatch ? Number(yearMatch[1]) : y;
  for (const [name, idx] of Object.entries(MONTHS)) {
    if (p.includes(name)) {
      return { from: iso(new Date(year, idx, 1)), to: iso(new Date(year, idx + 1, 0)) };
    }
  }
  if (p.includes("год")) return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (p.includes("квартал")) {
    const q = Math.floor(now.getMonth() / 3);
    return { from: iso(new Date(year, q * 3, 1)), to: iso(new Date(year, q * 3 + 3, 0)) };
  }
  // По умолчанию — текущий месяц.
  return { from: iso(new Date(y, now.getMonth(), 1)), to: iso(new Date(y, now.getMonth() + 1, 0)) };
}

async function tenantsByName(ctx: Ctx, name?: string) {
  let q = ctx.sb.from("tenants").select("id, name").in("owner_id", ctx.ownerIds);
  if (name) q = q.ilike("name", `%${name}%`);
  const { data } = await q.limit(50);
  return (data ?? []) as { id: string; name: string }[];
}

/** Долги: сальдо по договорам (начислено − оплачено), как на дашборде. */
async function tenantDebts(ctx: Ctx, args: { tenant?: string; limit?: number }) {
  const limit = Math.min(args.limit ?? 10, 25);
  const { data: charges } = await ctx.sb
    .from("charges")
    .select("id, contract_id, total, paid_total, due_date, period_start, period_end")
    .in("owner_id", ctx.ownerIds);
  const { data: contracts } = await ctx.sb
    .from("contracts")
    .select(
      "id, number, tenant_id, property_id, tenant:tenants(id,name), property:properties(id,name)",
    )
    .in("owner_id", ctx.ownerIds);

  const contractById = new Map((contracts ?? []).map((c: any) => [c.id, c]));
  const byTenant = new Map<
    string,
    { name: string; debt: number; contracts: Map<string, number> }
  >();
  for (const ch of charges ?? []) {
    const c: any = contractById.get(ch.contract_id);
    if (!c) continue;
    const remain = Number(ch.total) - Number(ch.paid_total);
    const tid = c.tenant?.id ?? c.tenant_id;
    const e = byTenant.get(tid) ?? { name: c.tenant?.name ?? "—", debt: 0, contracts: new Map() };
    e.debt += remain;
    e.contracts.set(c.id, (e.contracts.get(c.id) ?? 0) + remain);
    byTenant.set(tid, e);
  }

  let rows = Array.from(byTenant.entries())
    .map(([id, e]) => ({ id, ...e }))
    .filter((r) => r.debt > 0.005);
  if (args.tenant) {
    const needle = args.tenant.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(needle));
  }
  rows.sort((a, b) => b.debt - a.debt);
  const top = rows.slice(0, limit);
  const total = rows.reduce((s, r) => s + r.debt, 0);

  const links: AiLink[] = top.map((r) => ({
    label: r.name,
    to: "/tenants/$id",
    params: { id: r.id },
    note: formatMoney(r.debt),
  }));

  if (top.length === 0) {
    return {
      summary: args.tenant
        ? `Долгов у «${args.tenant}» нет.`
        : "Задолженности нет ни у одного арендатора.",
      links: [],
    };
  }
  // Первым предложением — прямой ответ: модель переформулирует именно его,
  // а не выхватывает произвольную строку из списка.
  const lead = args.tenant
    ? `Долг «${top[0].name}» — ${formatMoney(top[0].debt)}.`
    : `Больше всех должен ${top[0].name} — ${formatMoney(top[0].debt)}.`;
  const rest = top
    .slice(1)
    .map((r) => `${r.name}: ${formatMoney(r.debt)}`)
    .join("; ");
  return {
    summary:
      `${lead} Всего должников ${rows.length}, общая задолженность ${formatMoney(total)}.` +
      (rest ? ` Далее по убыванию — ${rest}.` : ""),
    links,
  };
}

/**
 * Поступления (платежи) за период, при необходимости — по одному арендатору.
 * Платёж связан с арендатором через начисление и договор, поэтому фильтр
 * идёт по цепочке: арендатор → договоры → начисления → платежи.
 */
async function incomeForPeriod(
  ctx: Ctx,
  args: { period?: string; from?: string; to?: string; tenant?: string },
) {
  const { from, to } = resolvePeriod(args.period, args.from, args.to);
  const periodLabel = `${formatDate(from)} — ${formatDate(to)}`;

  let chargeIds: string[] | null = null;
  let tenantMatches: { id: string; name: string }[] = [];
  if (args.tenant) {
    tenantMatches = await tenantsByName(ctx, args.tenant);
    if (tenantMatches.length === 0) {
      return { summary: `Арендатор «${args.tenant}» не найден.`, links: [] };
    }
    const { data: contracts } = await ctx.sb
      .from("contracts")
      .select("id")
      .in("owner_id", ctx.ownerIds)
      .in(
        "tenant_id",
        tenantMatches.map((t) => t.id),
      );
    const contractIds = (contracts ?? []).map((c: any) => c.id);
    if (contractIds.length === 0) {
      return {
        summary: `У «${tenantMatches[0].name}» нет договоров, поступлений за ${periodLabel} нет.`,
        links: tenantMatches.map((t) => ({
          label: t.name,
          to: "/tenants/$id",
          params: { id: t.id },
        })),
      };
    }
    const { data: charges } = await ctx.sb
      .from("charges")
      .select("id")
      .in("owner_id", ctx.ownerIds)
      .in("contract_id", contractIds);
    const ids = (charges ?? []).map((c: any) => c.id as string);
    // Пустой список в .in() вернул бы все платежи — подставляем заведомо
    // несуществующий id, чтобы «нет начислений» означало «нет поступлений».
    chargeIds = ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"];
  }

  let q = ctx.sb
    .from("payments")
    .select("id, amount, paid_at, charge_id")
    .in("owner_id", ctx.ownerIds)
    .gte("paid_at", from)
    .lte("paid_at", to);
  if (chargeIds) q = q.in("charge_id", chargeIds);
  const { data: payments } = await q;
  const total = (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const count = (payments ?? []).length;

  if (args.tenant) {
    const who = tenantMatches.map((t) => t.name).join(", ");
    return {
      summary:
        `Доход от «${who}» за ${periodLabel} — ${formatMoney(total)}` +
        (count ? ` по ${count} платежам.` : ". Платежей за этот период не было."),
      links: tenantMatches.map((t) => ({
        label: `Арендатор: ${t.name}`,
        to: "/tenants/$id",
        params: { id: t.id },
        note: formatMoney(total),
      })),
    };
  }

  return {
    summary: `Всего поступило за ${periodLabel} — ${formatMoney(total)} по ${count} платежам (по всем арендаторам).`,
    links: [{ label: "Все платежи", to: "/payments", note: formatMoney(total) }],
  };
}

/** Начисления: неоплаченные и просроченные. */
async function unpaidCharges(ctx: Ctx, args: { tenant?: string; limit?: number }) {
  const limit = Math.min(args.limit ?? 10, 25);
  const today = todayISO();
  const { data: charges } = await ctx.sb
    .from("charges")
    .select("id, contract_id, total, paid_total, due_date, period_start, period_end, status")
    .in("owner_id", ctx.ownerIds)
    .neq("status", "paid")
    .order("due_date", { ascending: true });
  const { data: contracts } = await ctx.sb
    .from("contracts")
    .select("id, number, tenant:tenants(id,name)")
    .in("owner_id", ctx.ownerIds);
  const contractById = new Map((contracts ?? []).map((c: any) => [c.id, c]));

  let rows = (charges ?? [])
    .map((ch: any) => {
      const c: any = contractById.get(ch.contract_id);
      return {
        id: ch.id,
        tenant: c?.tenant?.name ?? "—",
        number: c?.number ?? "—",
        remain: Number(ch.total) - Number(ch.paid_total),
        due: ch.due_date as string | null,
        overdue: ch.due_date ? ch.due_date < today : false,
      };
    })
    .filter((r: any) => r.remain > 0.005);
  if (args.tenant) {
    const needle = args.tenant.toLowerCase();
    rows = rows.filter((r: any) => r.tenant.toLowerCase().includes(needle));
  }
  const overdue = rows.filter((r: any) => r.overdue);
  const top = rows.slice(0, limit);
  const totalRemain = rows.reduce((s: number, r: any) => s + r.remain, 0);

  if (rows.length === 0) {
    return { summary: "Неоплаченных начислений нет.", links: [] };
  }
  return {
    summary:
      `Неоплаченных начислений: ${rows.length} на ${formatMoney(totalRemain)}, ` +
      `из них просрочено ${overdue.length}. ` +
      top
        .map(
          (r: any) =>
            `${r.tenant} (№${r.number}) — ${formatMoney(r.remain)}${r.due ? `, срок ${formatDate(r.due)}` : ""}`,
        )
        .join("; ") +
      ".",
    links: top.map((r: any) => ({
      label: `${r.tenant} — начисление №${r.number}`,
      to: "/charges/$id",
      params: { id: r.id },
      note: formatMoney(r.remain),
    })),
  };
}

/** Договоры, истекающие в ближайшие N дней; при указании арендатора — только его. */
async function expiringContracts(ctx: Ctx, args: { days?: number; tenant?: string }) {
  const days = Math.min(Math.max(args.days ?? 90, 1), 365);
  const today = new Date();
  const limitDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const { data } = await ctx.sb
    .from("contracts")
    .select(
      "id, number, end_date, area, rate, payment_period, tenant:tenants(id,name), property:properties(id,name)",
    )
    .in("owner_id", ctx.ownerIds)
    .eq("status", "active")
    .not("end_date", "is", null)
    .gte("end_date", todayISO())
    .lte("end_date", iso(limitDate))
    .order("end_date", { ascending: true });
  let rows = (data ?? []) as any[];
  const who = args.tenant ? ` у «${args.tenant}»` : "";
  if (args.tenant) {
    const needle = args.tenant.toLowerCase();
    rows = rows.filter((c) => (c.tenant?.name ?? "").toLowerCase().includes(needle));
  }
  if (rows.length === 0) {
    return { summary: `Договоров, истекающих в ближайшие ${days} дней${who}, нет.`, links: [] };
  }
  return {
    summary:
      `Истекают в ближайшие ${days} дней${who}: ${rows.length} договор(ов). ` +
      rows
        .map(
          (c) =>
            `${c.tenant?.name ?? "—"} (№${c.number}, ${c.property?.name ?? "—"}) до ${formatDate(c.end_date)}`,
        )
        .join("; ") +
      ".",
    links: rows.map((c) => ({
      label: `${c.tenant?.name ?? "—"} — договор №${c.number}`,
      to: "/contracts/$id",
      params: { id: c.id },
      note: formatDate(c.end_date),
    })),
  };
}

/** Сводка по портфелю: площадь, занятость и аренда в месяц по контурам. */
async function portfolioOverview(ctx: Ctx) {
  const { data: properties } = await ctx.sb
    .from("properties")
    .select("id, name, type, area_total")
    .in("owner_id", ctx.ownerIds);
  const { data: contracts } = await ctx.sb
    .from("contracts")
    .select("id, area, rate, payment_period, status, kind, property:properties(id,type)")
    .in("owner_id", ctx.ownerIds)
    .eq("status", "active");

  const contour = (t?: string | null) =>
    t === "land"
      ? "Земля"
      : t === "office"
        ? "Офис"
        : t === "parking"
          ? "Машиноместа"
          : "Помещения";
  const unit = (c: string) => (c === "Машиноместа" ? "мест" : "м²");
  const acc = new Map<string, { total: number; leased: number; ahch: number; monthly: number }>();
  const get = (k: string) => {
    const v = acc.get(k) ?? { total: 0, leased: 0, ahch: 0, monthly: 0 };
    acc.set(k, v);
    return v;
  };
  for (const p of properties ?? []) get(contour(p.type)).total += Number(p.area_total || 0);
  for (const c of contracts ?? []) {
    const g = get(contour(c.property?.type));
    if (c.kind === "ahch") g.ahch += Number(c.area || 0);
    else {
      g.leased += Number(c.area || 0);
      g.monthly += monthlyPayment(Number(c.rate), c.payment_period, Number(c.area || 0));
    }
  }
  const parts = Array.from(acc.entries()).map(([k, v]) => {
    const usable = v.total - v.ahch;
    const occ = usable > 0 ? (v.leased / usable) * 100 : 0;
    return `${k}: ${Math.round(v.total)} ${unit(k)}, сдано ${Math.round(v.leased)}, занятость ${occ.toFixed(1)}%, аренда ${formatMoney(v.monthly)}/мес`;
  });
  const monthlyTotal = Array.from(acc.values()).reduce((s, v) => s + v.monthly, 0);
  return {
    summary: `Портфель по контурам — ${parts.join("; ")}. Всего аренды ${formatMoney(monthlyTotal)} в месяц.`,
    links: [{ label: "Дашборд", to: "/dashboard", note: formatMoney(monthlyTotal) }],
  };
}

/**
 * Что арендует конкретный арендатор: площади по контурам, объекты, аренда в
 * месяц и текущий долг. Отвечает на «сколько метров занимает», «что арендует»,
 * «сколько платит» — там, где сводка по портфелю дала бы итог по всем.
 */
async function tenantOverview(ctx: Ctx, args: { tenant?: string }) {
  if (!args.tenant) return { summary: "Не указан арендатор.", links: [] };
  const matches = await tenantsByName(ctx, args.tenant);
  if (matches.length === 0) return { summary: `Арендатор «${args.tenant}» не найден.`, links: [] };

  const ids = matches.map((t) => t.id);
  const { data: contracts } = await ctx.sb
    .from("contracts")
    .select(
      "id, number, area, rate, payment_period, status, kind, tenant_id, property:properties(id,name,type)",
    )
    .in("owner_id", ctx.ownerIds)
    .in("tenant_id", ids);

  const active = (contracts ?? []).filter((c: any) => c.status === "active");
  if (active.length === 0) {
    return {
      summary: `У «${matches[0].name}» нет действующих договоров.`,
      links: matches.map((t) => ({
        label: `Арендатор: ${t.name}`,
        to: "/tenants/$id",
        params: { id: t.id },
      })),
    };
  }

  const contour = (t?: string | null) =>
    t === "land"
      ? "земли"
      : t === "office"
        ? "офиса"
        : t === "parking"
          ? "машиномест"
          : "помещений";
  const unit = (t?: string | null) => (t === "parking" ? "мест" : "м²");

  const byContour = new Map<string, { area: number; unit: string }>();
  let monthly = 0;
  for (const c of active) {
    const key = contour(c.property?.type);
    const g = byContour.get(key) ?? { area: 0, unit: unit(c.property?.type) };
    g.area += Number(c.area || 0);
    byContour.set(key, g);
    monthly += monthlyPayment(Number(c.rate), c.payment_period, Number(c.area || 0));
  }
  const areaText = Array.from(byContour.entries())
    .map(([k, v]) => `${Math.round(v.area * 100) / 100} ${v.unit} ${k}`)
    .join(", ");

  // Долг того же арендатора — частый следующий вопрос, считаем сразу.
  const { data: charges } = await ctx.sb
    .from("charges")
    .select("total, paid_total")
    .in("owner_id", ctx.ownerIds)
    .in(
      "contract_id",
      (contracts ?? []).map((c: any) => c.id),
    );
  const debt = (charges ?? []).reduce(
    (s: number, ch: any) => s + (Number(ch.total) - Number(ch.paid_total)),
    0,
  );

  const objects = Array.from(
    new Set(active.map((c: any) => c.property?.name).filter(Boolean)),
  ).join(", ");

  return {
    summary:
      `«${matches[0].name}» занимает ${areaText} по ${active.length} действующим договорам ` +
      `(${objects}). Аренда ${formatMoney(monthly)} в месяц.` +
      (debt > 0.005 ? ` Текущий долг ${formatMoney(debt)}.` : " Задолженности нет."),
    links: [
      ...matches.map((t) => ({
        label: `Арендатор: ${t.name}`,
        to: "/tenants/$id",
        params: { id: t.id },
      })),
      ...active.map((c: any) => ({
        label: `Договор №${c.number} — ${c.property?.name ?? "—"}`,
        to: "/contracts/$id",
        params: { id: c.id },
        note: `${Number(c.area || 0)} ${unit(c.property?.type)}`,
      })),
    ],
  };
}

/** Поиск арендатора, объекта или договора по названию. */
async function findEntity(ctx: Ctx, args: { query: string }) {
  const q = args.query.trim();
  if (!q) return { summary: "Пустой запрос поиска.", links: [] };
  const [tenants, properties, contracts] = await Promise.all([
    ctx.sb
      .from("tenants")
      .select("id, name")
      .in("owner_id", ctx.ownerIds)
      .ilike("name", `%${q}%`)
      .limit(5),
    ctx.sb
      .from("properties")
      .select("id, name, area_total")
      .in("owner_id", ctx.ownerIds)
      .ilike("name", `%${q}%`)
      .limit(5),
    ctx.sb
      .from("contracts")
      .select("id, number, tenant:tenants(name)")
      .in("owner_id", ctx.ownerIds)
      .ilike("number", `%${q}%`)
      .limit(5),
  ]);
  const links: AiLink[] = [
    ...(tenants.data ?? []).map((t: any) => ({
      label: `Арендатор: ${t.name}`,
      to: "/tenants/$id",
      params: { id: t.id },
    })),
    ...(properties.data ?? []).map((p: any) => ({
      label: `Объект: ${p.name}`,
      to: "/properties/$id",
      params: { id: p.id },
      note: `${Math.round(Number(p.area_total || 0))} м²`,
    })),
    ...(contracts.data ?? []).map((c: any) => ({
      label: `Договор №${c.number}${c.tenant?.name ? ` — ${c.tenant.name}` : ""}`,
      to: "/contracts/$id",
      params: { id: c.id },
    })),
  ];
  if (links.length === 0) return { summary: `По запросу «${q}» ничего не найдено.`, links: [] };
  return { summary: `Найдено по запросу «${q}»: ${links.map((l) => l.label).join("; ")}.`, links };
}

/** Описания инструментов для модели: имена и параметры — на русском, как и вопросы. */
export const AI_TOOLS = {
  tenant_debts: {
    description:
      "Задолженность арендаторов: кто и сколько должен, общий долг. Используй для вопросов про долги, задолженность, кто не платит.",
    schema: z.object({
      tenant: z
        .string()
        .optional()
        .describe("Часть названия арендатора, если спрашивают про конкретного"),
      limit: z.number().int().optional().describe("Сколько должников показать, по умолчанию 10"),
    }),
    run: tenantDebts,
  },
  income_for_period: {
    description:
      "Сумма поступивших платежей за период — по всем арендаторам или по одному. " +
      "Используй для вопросов про доход, выручку, сколько получили денег. " +
      "Если в вопросе назван арендатор, ОБЯЗАТЕЛЬНО заполни tenant его названием.",
    schema: z.object({
      period: z
        .string()
        .optional()
        .describe("Период словами: «июнь 2026», «текущий месяц», «год», «квартал»"),
      from: z.string().optional().describe("Начало периода YYYY-MM-DD"),
      to: z.string().optional().describe("Конец периода YYYY-MM-DD"),
      tenant: z
        .string()
        .optional()
        .describe("Название арендатора, если доход спрашивают по конкретному"),
    }),
    run: incomeForPeriod,
  },
  unpaid_charges: {
    description:
      "Неоплаченные и просроченные начисления. Используй для вопросов про неоплаченные счета, просрочку, что не оплачено.",
    schema: z.object({
      tenant: z.string().optional().describe("Часть названия арендатора"),
      limit: z.number().int().optional(),
    }),
    run: unpaidCharges,
  },
  expiring_contracts: {
    description:
      "Договоры, срок которых заканчивается. Используй для вопросов про истекающие договоры, что скоро закончится, продление.",
    schema: z.object({
      days: z
        .number()
        .int()
        .optional()
        .describe("За сколько дней вперёд смотреть, по умолчанию 90"),
      tenant: z
        .string()
        .optional()
        .describe("Название арендатора, если спрашивают про его договоры"),
    }),
    run: expiringContracts,
  },
  tenant_overview: {
    description:
      "Что арендует конкретный арендатор: площади по контурам, объекты, аренда в месяц, долг. " +
      "Используй для вопросов «сколько метров занимает X», «что арендует X», «сколько платит X».",
    schema: z.object({
      tenant: z.string().optional().describe("Название арендатора"),
    }),
    run: tenantOverview,
  },
  portfolio_overview: {
    description:
      "Сводка по недвижимости: площади, занятость и аренда в месяц по контурам (помещения, земля, офис, машиноместа). Используй для вопросов про площадь, занятость, вакантность, сколько всего сдано.",
    schema: z.object({}),
    run: portfolioOverview,
  },
  find_entity: {
    description:
      "Поиск арендатора, объекта или договора по названию или номеру. Используй, когда спрашивают «найди», «покажи», «где» про конкретное имя.",
    schema: z.object({ query: z.string().describe("Название или номер для поиска") }),
    run: findEntity,
  },
} as const;

export type AiToolName = keyof typeof AI_TOOLS;

/** Выполняет инструмент по имени; неизвестное имя — понятная ошибка для модели. */
export async function runAiTool(
  name: string,
  args: Record<string, unknown>,
  ctx: Ctx,
): Promise<AiToolResult> {
  const tool = (AI_TOOLS as Record<string, any>)[name];
  if (!tool) return { summary: `Инструмент «${name}» не существует.`, links: [] };
  const parsed = tool.schema.safeParse(args ?? {});
  if (!parsed.success) {
    return { summary: `Неверные параметры для «${name}»: ${parsed.error.message}`, links: [] };
  }
  return tool.run(ctx, parsed.data);
}

export { tenantsByName };
