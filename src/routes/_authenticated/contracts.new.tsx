import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ContractForm, type ContractFormValues } from "@/components/contract-form";
import { contractRowFromForm } from "@/lib/contracts";
import { toast } from "sonner";
import { z } from "zod";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { Button } from "@/components/ui/button";
import { useEffectiveOwnerId } from "@/lib/manager-context";
import { insertContractMeters } from "@/lib/meters";

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
        .insert({ owner_id: ownerId, ...contractRowFromForm(v) })
        .select()
        .single();
      if (error) throw error;
      try {
        await insertContractMeters({
          ownerId,
          contractId: data.id,
          propertyId: v.property_id,
          drafts: v.meters,
        });
      } catch (e: any) {
        throw new Error(`Договор создан, но счётчики не сохранились: ${e.message}`);
      }
      return data;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      qc.invalidateQueries({ queryKey: ["meters"] });
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
