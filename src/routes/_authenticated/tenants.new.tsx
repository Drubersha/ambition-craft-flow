import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TenantForm, type TenantFormValues } from "@/components/tenant-form";
import { tenantRowFromForm } from "@/lib/tenants";
import { toast } from "sonner";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { Button } from "@/components/ui/button";
import { useEffectiveOwnerId } from "@/lib/manager-context";

export const Route = createFileRoute("/_authenticated/tenants/new")({
  component: NewTenant,
});

function NewTenant() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { ownerId } = useEffectiveOwnerId();
  const mut = useMutation({
    mutationFn: async (v: TenantFormValues) => {
      if (!ownerId) throw new Error("Не удалось определить арендодателя");
      const { data, error } = await supabase
        .from("tenants")
        .insert({ owner_id: ownerId, ...tenantRowFromForm(v) })
        .select()
        .single();
      if (error) throw error;
      if (v.contacts.length > 0) {
        const { error: cErr } = await supabase.from("tenant_contacts").insert(
          v.contacts.map((c, i) => ({
            owner_id: ownerId,
            tenant_id: data.id,
            full_name: c.full_name.trim(),
            email: c.email.trim() || null,
            phone: c.phone.trim() || null,
            sort_order: i,
          })),
        );
        if (cErr) throw cErr;
      }
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
      <TenantForm
        formId="tenant-new-form"
        onSubmit={(v) => mut.mutate(v)}
        submitting={mut.isPending}
      />
      <MobileActionBar>
        <Button
          type="submit"
          form="tenant-new-form"
          size="lg"
          className="flex-1 min-h-11"
          disabled={mut.isPending}
        >
          {mut.isPending ? "Сохранение..." : "Создать арендатора"}
        </Button>
      </MobileActionBar>
    </div>
  );
}
