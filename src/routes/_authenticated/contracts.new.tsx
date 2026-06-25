import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ContractForm, type ContractFormValues } from "@/components/contract-form";
import { computeDepositWithArea } from "@/lib/format";
import { toast } from "sonner";
import { z } from "zod";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { Button } from "@/components/ui/button";
import { useEffectiveOwnerId } from "@/lib/manager-context";

const search = z.object({ tenant: z.string().optional(), property: z.string().optional() });

export const Route = createFileRoute("/_authenticated/contracts/new")({
  validateSearch: search,
  component: NewContract,
});

function NewContract() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sp = useSearch({ from: "/_authenticated/contracts/new" });
  const { ownerId } = useEffectiveOwnerId();
  const mut = useMutation({
    mutationFn: async (v: ContractFormValues) => {
      if (!ownerId) throw new Error("Не удалось определить арендодателя");
      const { data, error } = await supabase
        .from("contracts")
        .insert({
          owner_id: ownerId,
          tenant_id: v.tenant_id,
          property_id: v.property_id,
          number: v.number || null,
          cadastral_no: v.cadastral_no || null,
          area: v.area ? Number(v.area) : null,
          rate: Number(v.rate) || 0,
          currency: v.currency || "RUB",
          payment_period: v.payment_period as any,
          status: v.status as any,
          kind: v.kind as any,
          start_date: v.start_date,
          end_date: v.end_date || null,
          notes: v.notes || null,
          termination_terms: v.termination_terms || null,
          deposit_percent: v.deposit_percent ? Number(v.deposit_percent) : null,
          deposit_amount: v.deposit_percent
            ? computeDepositWithArea(
                Number(v.rate) || 0,
                v.payment_period,
                Number(v.area) || 0,
                Number(v.deposit_percent),
              )
            : null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      toast.success("Договор создан");
      navigate({ to: "/contracts/$id", params: { id: d.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">Новый договор</h1>
      <ContractForm
        formId="contract-new-form"
        initial={{ tenant_id: sp.tenant ?? "", property_id: sp.property ?? "" }}
        onSubmit={(v) => mut.mutate(v)}
        submitting={mut.isPending}
      />
      <MobileActionBar>
        <Button
          type="submit"
          form="contract-new-form"
          size="lg"
          className="flex-1 min-h-11"
          disabled={mut.isPending}
        >
          {mut.isPending ? "Сохранение..." : "Создать договор"}
        </Button>
      </MobileActionBar>
    </div>
  );
}
