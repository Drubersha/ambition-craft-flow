import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TenantForm, type TenantFormValues } from "@/components/tenant-form";
import { toast } from "sonner";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/tenants/new")({
  component: NewTenant,
});

function NewTenant() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (v: TenantFormValues) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("tenants").insert({
        owner_id: u.user!.id,
        name: v.name, kind: v.kind as any,
        inn: v.inn || null, phone: v.phone || null, email: v.email || null,
        contact_person: v.contact_person || null, notes: v.notes || null,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Арендатор добавлен");
      navigate({ to: "/tenants/$id", params: { id: d.id } });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">Новый арендатор</h1>
      <TenantForm formId="tenant-new-form" onSubmit={(v) => mut.mutate(v)} submitting={mut.isPending} />
      <MobileActionBar>
        <Button type="submit" form="tenant-new-form" size="lg" className="flex-1 min-h-11" disabled={mut.isPending}>
          {mut.isPending ? "Сохранение..." : "Создать арендатора"}
        </Button>
      </MobileActionBar>
    </div>
  );
}