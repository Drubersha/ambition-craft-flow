/**
 * Доменный слой дашборда: типы строк выборки, границы периода фильтра
 * и чистые расчёты (каскадная фильтрация, KPI портфеля). Без React и запросов.
 */
import { daysUntil, monthlyFromRate, monthlyPayment } from "./format";

export type Period = "day" | "month" | "quarter" | "year" | "custom";

export type Property = {
  id: string;
  name: string;
  type: string;
  status: string;
  area_total: number;
  base_rate: number | null;
  currency: string;
};

export type Contract = {
  id: string;
  number: string;
  status: string;
  kind: string;
  start_date: string;
  end_date: string | null;
  rate: number;
  area: number | null;
  payment_period: string;
  currency: string;
  property_id: string;
  tenant_id: string;
  tenant: { id: string; name: string } | null;
  property: { id: string; name: string; type: string; area_total: number } | null;
};

export type Charge = {
  id: string;
  contract_id: string;
  total: number;
  paid_total: number;
  status: string;
  due_date: string | null;
  period_start: string;
  period_end: string;
};

export type Payment = {
  id: string;
  charge_id: string;
  amount: number;
  paid_at: string;
  method: string | null;
};

export type DashboardData = {
  properties: Property[];
  contracts: Contract[];
  charges: Charge[];
  payments: Payment[];
};

/** Данные после фильтров: договоры аренды отдельно от АХЧ. */
export type FilteredDashboardData = DashboardData & { ahchContracts: Contract[] };

export function getPeriodRange(
  period: Period,
  customFrom?: string,
  customTo?: string,
): [Date, Date] {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  let start = new Date(now);
  switch (period) {
    case "day":
      start.setHours(0, 0, 0, 0);
      break;
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1);
      break;
    }
    case "year":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case "custom":
      if (customFrom) start = new Date(customFrom);
      if (customTo) {
        const e = new Date(customTo);
        e.setHours(23, 59, 59, 999);
        return [start, e];
      }
      break;
  }
  return [start, end];
}

export function periodLabel(p: Period) {
  return {
    day: "Сегодня",
    month: "Месяц",
    quarter: "Квартал",
    year: "Год",
    custom: "Произвольный",
  }[p];
}

/**
 * Каскадная фильтрация: объекты по выбору → договоры этих объектов
 * (АХЧ отдельно) → начисления договоров → платежи начислений.
 */
export function filterDashboardData(
  data: DashboardData | undefined,
  selected: { properties: string[]; types: string[]; statuses: string[] },
): FilteredDashboardData {
  if (!data) return { properties: [], contracts: [], charges: [], payments: [], ahchContracts: [] };
  const propIdSet = new Set(
    data.properties
      .filter(
        (p) =>
          (selected.properties.length === 0 || selected.properties.includes(p.id)) &&
          (selected.types.length === 0 || selected.types.includes(p.type)) &&
          (selected.statuses.length === 0 || selected.statuses.includes(p.status)),
      )
      .map((p) => p.id),
  );
  const properties = data.properties.filter((p) => propIdSet.has(p.id));
  const allContracts = data.contracts.filter((c) => propIdSet.has(c.property_id));
  const ahchContracts = allContracts.filter((c) => c.kind === "ahch");
  const contracts = allContracts.filter((c) => c.kind !== "ahch");
  const contractIdSet = new Set(contracts.map((c) => c.id));
  const charges = data.charges.filter((c) => contractIdSet.has(c.contract_id));
  const chargeIdSet = new Set(charges.map((c) => c.id));
  const payments = data.payments.filter((p) => chargeIdSet.has(p.charge_id));
  return { properties, contracts, charges, payments, ahchContracts };
}

/**
 * Контур аренды по типу объекта: у разных контуров разная природа ставки
 * (₽/м² у помещений и земли, ₽/место у машиномест), усреднять их вместе нельзя.
 */
export const CONTOUR_ORDER = ["Помещения", "Земля", "Офис", "Машиноместа"] as const;

export function contourOfType(type: string | null | undefined): (typeof CONTOUR_ORDER)[number] {
  if (type === "land") return "Земля";
  if (type === "office") return "Офис";
  if (type === "parking") return "Машиноместа";
  return "Помещения";
}

export function contourRateUnit(contour: string): string {
  return contour === "Машиноместа" ? "₽/место/мес" : "₽/м²/мес";
}

/** Машиноместа измеряются местами, остальные контуры — квадратными метрами. */
export function contourAreaUnit(contour: string): string {
  return contour === "Машиноместа" ? "мест" : "м²";
}

export type ContourArea = {
  label: string;
  unit: string;
  /** Площадь (или количество мест) объектов контура. */
  total: number;
  /** Сдано по активным договорам аренды. */
  leased: number;
  /** Занято под АХЧ — собственные нужды. */
  ahch: number;
  /** Свободно: ни аренды, ни АХЧ. Не бывает отрицательным. */
  free: number;
  /** Что вообще можно сдавать: площадь без АХЧ. */
  rentable: number;
  /** Занятость в % от площади без АХЧ; null, если контур не имеет площади. */
  occupancy: number | null;
  properties: number;
};

/**
 * Площадь и занятость по контурам: метры офиса, земли и складов — разные
 * величины, а машиноместа вообще считаются штуками, поэтому один общий
 * итог по портфелю смысла не имеет.
 */
export function computeContourAreas(
  properties: Property[],
  contracts: Contract[],
  ahchContracts: Contract[],
): ContourArea[] {
  const groups = new Map<
    string,
    { total: number; leased: number; ahch: number; properties: number }
  >();
  const bucket = (label: string) => {
    const g = groups.get(label) || { total: 0, leased: 0, ahch: 0, properties: 0 };
    groups.set(label, g);
    return g;
  };

  for (const p of properties) {
    const g = bucket(contourOfType(p.type));
    g.total += Number(p.area_total || 0);
    g.properties += 1;
  }
  for (const c of contracts) {
    if (c.status !== "active") continue;
    bucket(contourOfType(c.property?.type)).leased += Number(c.area || 0);
  }
  for (const c of ahchContracts) {
    if (c.status !== "active") continue;
    bucket(contourOfType(c.property?.type)).ahch += Number(c.area || 0);
  }

  return CONTOUR_ORDER.filter((label) => groups.has(label)).map((label) => {
    const g = groups.get(label)!;
    const usable = g.total - g.ahch;
    return {
      label,
      unit: contourAreaUnit(label),
      total: g.total,
      leased: g.leased,
      ahch: g.ahch,
      // Отрицательное «свободно» означало бы, что сдано больше, чем есть, —
      // такие данные встречаются (пересдача), но показывать минус нельзя.
      free: Math.max(0, g.total - g.leased - g.ahch),
      rentable: Math.max(0, usable),
      occupancy: usable > 0 ? (g.leased / usable) * 100 : null,
      properties: g.properties,
    };
  });
}

export type ContourRate = { label: string; rate: number; unit: string; contracts: number };

/**
 * Средневзвешенные по площади ставки по контурам (только договоры с площадью > 0).
 * Порядок — CONTOUR_ORDER, контуры без договоров опускаются.
 */
export function computeContourRates(contracts: Contract[]): ContourRate[] {
  const groups = new Map<string, { num: number; den: number; contracts: number }>();
  for (const c of contracts) {
    if (c.status !== "active") continue;
    const area = Number(c.area || 0);
    if (area <= 0) continue;
    const label = contourOfType(c.property?.type);
    const monthly = monthlyFromRate(Number(c.rate), c.payment_period);
    const g = groups.get(label) || { num: 0, den: 0, contracts: 0 };
    g.num += monthly * area;
    g.den += area;
    g.contracts += 1;
    groups.set(label, g);
  }
  return CONTOUR_ORDER.filter((label) => groups.has(label)).map((label) => {
    const g = groups.get(label)!;
    return {
      label,
      rate: g.den > 0 ? g.num / g.den : 0,
      unit: contourRateUnit(label),
      contracts: g.contracts,
    };
  });
}

export type ContourIncome = {
  label: string;
  /** Поступило платежей за период. */
  rentIncome: number;
  /** Начисляется в месяц по активным договорам (ставка × площадь). */
  monthlyIncome: number;
};

/**
 * Доходы по контурам: платёж относится к контуру через начисление и договор,
 * поэтому маппинг строится по всем договорам, а не только по активным —
 * оплаты приходят и по завершённым.
 */
export function computeContourIncomes(
  filtered: FilteredDashboardData,
  periodStart: Date,
  periodEnd: Date,
): ContourIncome[] {
  const contourByContract = new Map<string, string>();
  for (const c of filtered.contracts) {
    contourByContract.set(c.id, contourOfType(c.property?.type));
  }
  const contourByCharge = new Map<string, string>();
  for (const ch of filtered.charges) {
    const label = contourByContract.get(ch.contract_id);
    if (label) contourByCharge.set(ch.id, label);
  }

  const groups = new Map<string, { rentIncome: number; monthlyIncome: number }>();
  const bucket = (label: string) => {
    const g = groups.get(label) || { rentIncome: 0, monthlyIncome: 0 };
    groups.set(label, g);
    return g;
  };

  for (const c of filtered.contracts) {
    if (c.status !== "active") continue;
    bucket(contourOfType(c.property?.type)).monthlyIncome += monthlyPayment(
      Number(c.rate),
      c.payment_period,
      Number(c.area || 0),
    );
  }
  for (const p of filtered.payments) {
    const d = new Date(p.paid_at);
    if (d < periodStart || d > periodEnd) continue;
    const label = contourByCharge.get(p.charge_id);
    if (!label) continue;
    bucket(label).rentIncome += Number(p.amount);
  }

  return CONTOUR_ORDER.filter((label) => groups.has(label)).map((label) => ({
    label,
    ...groups.get(label)!,
  }));
}

/** Связка составного договора с одним из его объектов. */
export type ContractLink = { contract_id: string; property_id: string; area: number };

/**
 * Раскрывает составные договоры (несколько объектов через contract_properties)
 * в виртуальные строки по объектам — только для расчёта площадей и занятости.
 * Деньги и ставки считаются по исходным договорам: связки могут покрывать не
 * всю договорную площадь, и деление ставки по ним исказило бы доход.
 */
export function expandContractLinks(
  contracts: Contract[],
  links: ContractLink[] | undefined,
  properties: Property[],
): Contract[] {
  if (!links || links.length === 0) return contracts;
  const byContract = new Map<string, ContractLink[]>();
  for (const l of links) {
    const arr = byContract.get(l.contract_id) ?? [];
    arr.push(l);
    byContract.set(l.contract_id, arr);
  }
  const propById = new Map(properties.map((p) => [p.id, p]));
  const out: Contract[] = [];
  for (const c of contracts) {
    const ls = byContract.get(c.id);
    if (!ls) {
      out.push(c);
      continue;
    }
    for (const l of ls) {
      const p = propById.get(l.property_id);
      out.push({
        ...c,
        property_id: l.property_id,
        area: Number(l.area),
        property: p
          ? { id: p.id, name: p.name, type: p.type, area_total: Number(p.area_total) }
          : c.property,
      });
    }
  }
  return out;
}

/** KPI портфеля за период. Занятость считается от площади без АХЧ. */
export function computeKpi(
  filtered: FilteredDashboardData,
  periodStart: Date,
  periodEnd: Date,
  links?: ContractLink[],
) {
  const totalArea = filtered.properties.reduce((s, p) => s + Number(p.area_total || 0), 0);
  const activeContracts = filtered.contracts.filter((c) => c.status === "active");
  const activeAhch = filtered.ahchContracts.filter((c) => c.status === "active");
  // Для площадей составные договоры раскрываются по объектам.
  const areaContracts = expandContractLinks(activeContracts, links, filtered.properties);
  const areaAhch = expandContractLinks(activeAhch, links, filtered.properties);
  const ahchArea = areaAhch.reduce((s, c) => s + Number(c.area || 0), 0);
  const leasedArea = areaContracts.reduce((s, c) => s + Number(c.area || 0), 0);
  const usableArea = totalArea - ahchArea;
  const occupancy = usableArea > 0 ? (leasedArea / usableArea) * 100 : 0;

  const periodPayments = filtered.payments.filter((p) => {
    const d = new Date(p.paid_at);
    return d >= periodStart && d <= periodEnd;
  });
  const rentIncome = periodPayments.reduce((s, p) => s + Number(p.amount), 0);

  // Ставки по контурам: помещения, земля, офис — ₽/м², машиноместа — ₽/место.
  const avgRates = computeContourRates(activeContracts);
  const avgRate = avgRates.find((r) => r.label === "Помещения")?.rate ?? 0;

  // Площадь и занятость по контурам — метры офиса, земли и складов несопоставимы.
  const areas = computeContourAreas(filtered.properties, areaContracts, areaAhch);
  const premises = areas.find((a) => a.label === "Помещения");
  // Долю АХЧ считаем внутри его контура: делить метры складов на сумму
  // с землёй и машиноместами бессмысленно.
  const ahchBase = areas.reduce((s, a) => (a.ahch > 0 ? s + a.total : s), 0);
  const ahchShare = ahchBase > 0 ? (ahchArea / ahchBase) * 100 : 0;

  const incomes = computeContourIncomes(filtered, periodStart, periodEnd);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Дебиторка по срокам давности: корзины складываются в общий долг, поэтому
  // KPI и разбивка под ним всегда сходятся между собой.
  // Начисления текущего месяца в дебиторку не входят: это идущий платёжный
  // цикл, а не долг — после генерации месячной аренды «Дебиторка: всего»
  // подскакивала на сумму всех свежих начислений, срок которых не наступил.
  const { current: curMonthCharges, past: pastCharges } = splitByCurrentMonth(
    filtered.charges,
    today,
  );
  const aging = computeDebtAging(pastCharges, today);
  const overdueAmt = aging.overdue;
  const currentMonthUnpaid = curMonthCharges.reduce(
    (s, c) => s + Math.max(Number(c.total) - Number(c.paid_total), 0),
    0,
  );

  const expSoon = activeContracts.filter((c) => {
    const d = daysUntil(c.end_date);
    return d !== null && d >= 0 && d <= 90;
  }).length;

  const monthlyIncome = activeContracts.reduce((s, c) => {
    return s + monthlyPayment(Number(c.rate), c.payment_period, Number(c.area || 0));
  }, 0);

  return {
    totalArea,
    premisesArea: premises?.total ?? 0,
    premisesOccupancy: premises?.occupancy ?? null,
    areas,
    incomes,
    propsCount: filtered.properties.length,
    occupancy,
    rentIncome,
    avgRate,
    avgRates,
    overdueAmt,
    aging,
    currentMonthUnpaid,
    expSoon,
    monthlyIncome,
    ahchArea,
    ahchShare,
  };
}

/** Неоплаченная дебиторка прошлых периодов по контурам (без начислений текущего
 *  месяца — как в KPI «Дебиторка: всего»). Сумма по всем контурам сходится с
 *  aging.total из computeKpi. */
export function computeContourDebt(
  filtered: FilteredDashboardData,
  today: Date = new Date(),
): Map<string, number> {
  const contourByContract = new Map<string, string>();
  for (const c of filtered.contracts) {
    contourByContract.set(c.id, contourOfType(c.property?.type));
  }
  const { past } = splitByCurrentMonth(filtered.charges, today);
  const out = new Map<string, number>();
  for (const ch of past) {
    const remain = Number(ch.total) - Number(ch.paid_total);
    if (remain <= 0.005) continue;
    const contour = contourByContract.get(ch.contract_id);
    if (!contour) continue;
    out.set(contour, (out.get(contour) || 0) + remain);
  }
  return out;
}

/** Точка месячного ряда контура: поступления, начислено/оплачено и занятость. */
export type ContourMonthPoint = {
  /** Ключ месяца "YYYY-MM". */
  month: string;
  /** Поступило платежей за месяц по контуру (платёж → начисление → договор). */
  income: number;
  /** Начислено за месяц (начисления, чей период приходится на этот месяц). */
  billed: number;
  /** Оплачено по начислениям месяца (min(paid_total, total) по каждому). */
  collected: number;
  /** Занятость контура в месяце, %; null — если у контура нет площади под сдачу. */
  occupancy: number | null;
};

/**
 * Годовые ряды по контурам (по умолчанию 12 последних месяцев, включая текущий).
 *
 * Деньги считаются по исходным договорам (составные договоры не дробятся:
 * оплата приходит на договор целиком). Занятость — по раскрытым связкам, чтобы
 * составной договор разложился по своим контурам, как в снимке «сейчас».
 *
 * Знаменатель занятости — площадь контура без АХЧ на текущий момент: у объектов
 * нет истории площади, поэтому прошлые месяцы делятся на сегодняшнюю базу (та же
 * оговорка, что и в 12-месячном графике занятости).
 */
export function computeContourYear(
  filtered: FilteredDashboardData,
  links: ContractLink[] | undefined,
  today: Date = new Date(),
  months = 12,
): Map<string, ContourMonthPoint[]> {
  const monthList: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    monthList.push(monthKeyLocal(today.getFullYear(), today.getMonth() - i));
  }
  const inWindow = new Set(monthList);

  // Контур каждого договора и начисления — для денег берём исходные договоры.
  const contourByContract = new Map<string, string>();
  for (const c of filtered.contracts) {
    contourByContract.set(c.id, contourOfType(c.property?.type));
  }
  const contourByCharge = new Map<string, string>();
  for (const ch of filtered.charges) {
    const label = contourByContract.get(ch.contract_id);
    if (label) contourByCharge.set(ch.id, label);
  }

  const money = new Map<
    string,
    Map<string, { income: number; billed: number; collected: number }>
  >();
  const cell = (contour: string, month: string) => {
    let m = money.get(contour);
    if (!m) {
      m = new Map();
      money.set(contour, m);
    }
    let c = m.get(month);
    if (!c) {
      c = { income: 0, billed: 0, collected: 0 };
      m.set(month, c);
    }
    return c;
  };

  for (const p of filtered.payments) {
    const month = (p.paid_at || "").slice(0, 7);
    if (!inWindow.has(month)) continue;
    const contour = contourByCharge.get(p.charge_id);
    if (!contour) continue;
    cell(contour, month).income += Number(p.amount);
  }
  for (const ch of filtered.charges) {
    const month = (ch.period_start || "").slice(0, 7);
    if (!inWindow.has(month)) continue;
    const contour = contourByContract.get(ch.contract_id);
    if (!contour) continue;
    const total = Number(ch.total) || 0;
    const paid = Number(ch.paid_total) || 0;
    const c = cell(contour, month);
    c.billed += total;
    c.collected += Math.min(paid, total);
  }

  // Занятость: сданная площадь контура в месяце к его площади без АХЧ (сейчас).
  const totalByContour = new Map<string, number>();
  for (const pr of filtered.properties) {
    const k = contourOfType(pr.type);
    totalByContour.set(k, (totalByContour.get(k) || 0) + Number(pr.area_total || 0));
  }
  const activeAhch = expandContractLinks(
    filtered.ahchContracts.filter((c) => c.status === "active"),
    links,
    filtered.properties,
  );
  const ahchByContour = new Map<string, number>();
  for (const c of activeAhch) {
    const k = contourOfType(c.property?.type);
    ahchByContour.set(k, (ahchByContour.get(k) || 0) + Number(c.area || 0));
  }
  const usableByContour = new Map<string, number>();
  for (const label of CONTOUR_ORDER) {
    usableByContour.set(
      label,
      Math.max(0, (totalByContour.get(label) || 0) - (ahchByContour.get(label) || 0)),
    );
  }

  const monthBounds = monthList.map((k) => {
    const [y, m] = k.split("-").map(Number);
    return { key: k, start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59, 999) };
  });
  const leased = new Map<string, Map<string, number>>();
  const expanded = expandContractLinks(filtered.contracts, links, filtered.properties);
  for (const c of expanded) {
    if (!c.start_date) continue;
    const area = Number(c.area || 0);
    if (area <= 0) continue;
    const contour = contourOfType(c.property?.type);
    const start = new Date(c.start_date);
    const end = c.end_date ? new Date(c.end_date) : null;
    for (const mb of monthBounds) {
      if (start <= mb.end && (!end || end >= mb.start)) {
        let m = leased.get(contour);
        if (!m) {
          m = new Map();
          leased.set(contour, m);
        }
        m.set(mb.key, (m.get(mb.key) || 0) + area);
      }
    }
  }

  const result = new Map<string, ContourMonthPoint[]>();
  for (const contour of CONTOUR_ORDER) {
    if (!totalByContour.has(contour) && !money.has(contour) && !leased.has(contour)) continue;
    const usable = usableByContour.get(contour) || 0;
    result.set(
      contour,
      monthList.map((month) => {
        const c = money.get(contour)?.get(month);
        const lea = leased.get(contour)?.get(month) || 0;
        return {
          month,
          income: c?.income || 0,
          billed: c?.billed || 0,
          collected: c?.collected || 0,
          occupancy: usable > 0 ? Math.min(100, (lea / usable) * 100) : null,
        };
      }),
    );
  }
  return result;
}

/** Ключ месяца "YYYY-MM" из года и (возможно отрицательного) индекса месяца. */
function monthKeyLocal(year: number, monthIndex: number): string {
  const d = new Date(year, monthIndex, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export type AgingBucket = {
  label: string;
  amount: number;
  count: number;
  /** Просроченные корзины — для подсветки; «срок не наступил» не просрочка. */
  overdue: boolean;
};

export type DebtAging = {
  buckets: AgingBucket[];
  /** Сумма просроченного (всё, кроме «срок не наступил»). */
  overdue: number;
  /** Вся неоплаченная дебиторка, включая ещё не наступившие сроки. */
  total: number;
};

/**
 * Делит начисления на текущий календарный месяц и прошлые периоды.
 *
 * Неоплаченная аренда текущего месяца — не дебиторка, а обычный платёжный
 * цикл: смешивание её со старым долгом делает «Дебиторку: всего» несравнимой
 * с отчётами по просрочке, которые строятся без начислений идущего месяца.
 */
/**
 * Поступления текущего месяца и та их часть, что ушла на начисления прошлых
 * периодов.
 *
 * Пара к собираемости: она считается только по начислениям месяца, поэтому
 * деньги, гасящие старые долги, в ней не видны — без этой цифры «поступило
 * 2,2 млн, а собираемость 7%» выглядит ошибкой, хотя оба числа честные.
 */
export function monthPaymentsToPast(
  payments: { amount: number; paid_at: string; charge_id: string }[],
  charges: { id: string; period_start: string }[],
  today: Date = new Date(),
): { monthTotal: number; toPastPeriods: number } {
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const periodOf = new Map(charges.map((c) => [c.id, (c.period_start || "").slice(0, 7)]));
  let monthTotal = 0;
  let toPastPeriods = 0;
  for (const p of payments) {
    if ((p.paid_at || "").slice(0, 7) !== ym) continue;
    monthTotal += Number(p.amount);
    const period = periodOf.get(p.charge_id);
    if (period !== undefined && period < ym) toPastPeriods += Number(p.amount);
  }
  return { monthTotal, toPastPeriods };
}

export function splitByCurrentMonth<T extends { period_start: string }>(
  charges: T[],
  today: Date = new Date(),
): { current: T[]; past: T[] } {
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const current: T[] = [];
  const past: T[] = [];
  for (const c of charges) {
    ((c.period_start || "").slice(0, 7) === ym ? current : past).push(c);
  }
  return { current, past };
}

/**
 * Дебиторка по срокам давности. Корзины складываются в общий долг: сумма всех
 * bucket.amount равна total, поэтому цифры на дашборде сходятся между собой.
 *
 * Начисления без срока оплаты попадают в отдельную корзину, а не выпадают из
 * подсчёта — иначе долг «терялся» бы незаметно.
 */
export function computeDebtAging(
  charges: { total: number; paid_total: number; due_date: string | null }[],
  today: Date = new Date(),
): DebtAging {
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  // «2026-06-20» парсится как полночь UTC, а midnight — локальная полночь:
  // в московском поясе разница в 3 часа сдвигала начисления на соседнюю
  // корзину. Разбираем дату как локальную.
  const localMidnight = (iso: string): number => {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1).getTime();
  };
  const rows = [
    { label: "Срок не наступил", amount: 0, count: 0, overdue: false },
    { label: "До 30 дней", amount: 0, count: 0, overdue: true },
    { label: "31–60 дней", amount: 0, count: 0, overdue: true },
    { label: "61–90 дней", amount: 0, count: 0, overdue: true },
    { label: "Более 90 дней", amount: 0, count: 0, overdue: true },
    { label: "Без срока оплаты", amount: 0, count: 0, overdue: false },
  ];

  for (const c of charges) {
    const remain = Number(c.total) - Number(c.paid_total);
    if (remain <= 0.005) continue;
    let idx: number;
    if (!c.due_date) {
      idx = 5;
    } else {
      const days = Math.round((midnight - localMidnight(c.due_date)) / 86_400_000);
      if (days < 0) idx = 0;
      else if (days <= 30) idx = 1;
      else if (days <= 60) idx = 2;
      else if (days <= 90) idx = 3;
      else idx = 4;
    }
    rows[idx].amount += remain;
    rows[idx].count += 1;
  }

  const buckets = rows.filter((r) => r.count > 0);
  return {
    buckets,
    overdue: buckets.filter((b) => b.overdue).reduce((s, b) => s + b.amount, 0),
    total: buckets.reduce((s, b) => s + b.amount, 0),
  };
}

/**
 * Собираемость за период: сколько из начисленного за период уже оплачено.
 *
 * Считается ТОЛЬКО по начислениям периода и их оплате (paid_total), а не по
 * всем платежам, пришедшим в эти даты. Иначе гашение старых долгов раздувает
 * числитель: в июле 2026 платежей пришло 2 399 991 при начислениях 65 721 —
 * формула «все платежи / начисления периода» давала 3652%, а показ упирался
 * в потолок 100% и создавал впечатление, что оплатили все.
 *
 * Переплата по отдельному начислению не компенсирует недоплату по другому,
 * поэтому вклад каждого ограничен его же суммой.
 */
export function computeCollectionRate(charges: { total: number; paid_total: number }[]): {
  billed: number;
  collected: number;
  rate: number | null;
} {
  let billed = 0;
  let collected = 0;
  for (const c of charges) {
    const total = Number(c.total) || 0;
    const paid = Number(c.paid_total) || 0;
    billed += total;
    collected += Math.min(paid, total);
  }
  return { billed, collected, rate: billed > 0 ? (collected / billed) * 100 : null };
}

/** Тон подсветки занятости: ≥90 — ok, ≥70 — warn, ниже — danger. */
export function occupancyTone(v: number): "ok" | "warn" | "danger" {
  if (v >= 90) return "ok";
  if (v >= 70) return "warn";
  return "danger";
}

/** CSS-класс текста для тона KPI. */
export function toneClass(t?: "ok" | "warn" | "danger") {
  if (t === "ok") return "text-success";
  if (t === "warn") return "text-warning";
  if (t === "danger") return "text-destructive";
  return "";
}
