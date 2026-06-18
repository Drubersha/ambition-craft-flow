import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ContractForm, type ContractFormValues } from "@/components/contract-form";
import { toast } from "sonner";
import { z } from "zod";

const search = z.object({ tenant: z.string().optional(), property: z.string().optional() });

export const Route = createFileRoute("/_authenticated/contracts/new")({
  validateSearch: search,
  component: NewContract,
});

function NewContract() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sp = useSearch({ from: "/_authenticated/contracts/new" });
  const mut = useMutation({
    mutationFn: async (v: ContractFormValues) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("contracts").insert({
        owner_id: u.user!.id,
        tenant_id: v.tenant_id, property_id: v.property_id,
        number: v.number, cadastral_no: v.cadastral_no || null,
        area: v.area ? Number(v.area) : null,
        rate: Number(v.rate) || 0, currency: v.currency || "RUB",
        payment_period: v.payment_period as any, status: v.status as any,
        start_date: v.start_date, end_date: v.end_date || null,
        notes: v.notes || null,
      }).select().single();
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
      <h1 className="text-2xl font-bold">Новый договор</h1>
      <ContractForm
        initial={{ tenant_id: sp.tenant ?? "", property_id: sp.property ?? "" }}
        onSubmit={(v) => mut.mutate(v)} submitting={mut.isPending}
      />
    </div>
  );
}