/**
 * Закрытие коммунального периода: создаёт период, начисления с позициями
 * kind='utilities', строки распределения и расход в бюджете папки.
 * Вынесено из UI, чтобы диалог отвечал только за форму и предпросмотр.
 */
import { supabase } from "@/integrations/supabase/client";
import { METER_TYPE_LABELS, METER_UNITS, formatDate } from "@/lib/format";
import { getPeriodFor } from "@/lib/budget";
import type { AllocationResult } from "@/lib/utilities";

const PAYMENT_DUE_DAYS = 10;

export type CloseUtilityPeriodParams = {
  ownerId: string;
  folderId: string;
  service: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  allocations: AllocationResult[];
};

export async function closeUtilityPeriod(
  params: CloseUtilityPeriodParams,
): Promise<{ chargesCreated: number }> {
  const periodId = await createPeriod(params);
  let chargesCreated = 0;
  for (const a of params.allocations) {
    if (a.amount <= 0) continue;
    await createChargeWithAllocation(params, periodId, a);
    chargesCreated++;
  }
  await recordBudgetExpense(params, periodId);
  return { chargesCreated };
}

async function createPeriod(p: CloseUtilityPeriodParams): Promise<string> {
  const { data, error } = await supabase
    .from("utility_periods")
    .insert({
      owner_id: p.ownerId,
      folder_id: p.folderId,
      service: p.service as never,
      period_start: p.periodStart,
      period_end: p.periodEnd,
      total_amount: p.totalAmount,
      status: "allocated" as const,
    })
    .select()
    .single();
  if (error) throw error;
  return data.id;
}

async function createChargeWithAllocation(
  p: CloseUtilityPeriodParams,
  periodId: string,
  a: AllocationResult,
): Promise<void> {
  const serviceLabel = METER_TYPE_LABELS[p.service] ?? p.service;
  const due = new Date();
  due.setDate(due.getDate() + PAYMENT_DUE_DAYS);

  const { data: charge, error: chErr } = await supabase
    .from("charges")
    .insert({
      owner_id: p.ownerId,
      contract_id: a.contractId,
      period_start: p.periodStart,
      period_end: p.periodEnd,
      due_date: due.toISOString().slice(0, 10),
      total: a.amount,
      notes: `Коммунальные услуги: ${serviceLabel}`,
    })
    .select()
    .single();
  if (chErr) throw chErr;

  const { error: ciErr } = await supabase.from("charge_items").insert({
    owner_id: p.ownerId,
    charge_id: charge.id,
    kind: "utilities",
    description: `${serviceLabel}${
      a.consumption != null ? `, ${a.consumption} ${METER_UNITS[p.service] ?? ""}` : ""
    }`,
    amount: a.amount,
  });
  if (ciErr) throw ciErr;

  const { error: alErr } = await supabase.from("utility_allocations").insert({
    owner_id: p.ownerId,
    period_id: periodId,
    contract_id: a.contractId,
    meter_id: a.meterId,
    charge_id: charge.id,
    consumption: a.consumption,
    amount: a.amount,
    method: a.method,
  });
  if (alErr) throw alErr;
}

/** Подвязка к затратам: расход в бюджете папки, категория «Коммунальные». */
async function recordBudgetExpense(p: CloseUtilityPeriodParams, periodId: string): Promise<void> {
  const { data: plan } = await supabase
    .from("budget_plans")
    .select("id, reset_day")
    .eq("folder_id", p.folderId)
    .maybeSingle();
  if (!plan) return;

  const categoryId = await ensureUtilitiesCategory(p.ownerId, plan.id);
  const serviceLabel = METER_TYPE_LABELS[p.service] ?? p.service;
  const bp = getPeriodFor(plan.reset_day, new Date(p.periodEnd));
  const { data: expense, error } = await supabase
    .from("budget_expenses")
    .insert({
      owner_id: p.ownerId,
      plan_id: plan.id,
      category_id: categoryId,
      amount: p.totalAmount,
      spent_at: p.periodEnd,
      period_start: bp.start,
      period_end: bp.end,
      note: `Коммуналка: ${serviceLabel} ${formatDate(p.periodStart)} — ${formatDate(p.periodEnd)}`,
    })
    .select()
    .single();
  if (error) throw error;
  await supabase.from("utility_periods").update({ expense_id: expense.id }).eq("id", periodId);
}

async function ensureUtilitiesCategory(ownerId: string, planId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("budget_categories")
    .select("id")
    .eq("plan_id", planId)
    .ilike("name", "Коммунальные%")
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase
    .from("budget_categories")
    .insert({ owner_id: ownerId, plan_id: planId, name: "Коммунальные", limit_amount: 0 })
    .select()
    .single();
  if (error) throw error;
  return created.id;
}
