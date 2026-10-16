import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PropertyForm, type PropertyFormValues } from "@/components/property-form";
import { toast } from "sonner";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { Button } from "@/components/ui/button";
import { useEffectiveOwnerId } from "@/lib/manager-context";
import { humanError } from "@/lib/human-error";
import { propertyRowFromForm } from "@/lib/properties";
import { z } from "zod";

const search = z.object({
  /** Папка, из которой нажали «Добавить»: подставляется в форму. */
  folder: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/properties/new")({
  validateSearch: search,
  component: NewProperty,
});

function NewProperty() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { folder } = Route.useSearch();
  const { ownerId, isLoading: ownerLoading } = useEffectiveOwnerId();
  const mut = useMutation({
    mutationFn: async (v: PropertyFormValues) => {
      if (!ownerId) throw new Error("Не удалось определить арендодателя");
      const { data, error } = await supabase
        .from("properties")
        .insert({ owner_id: ownerId, ...propertyRowFromForm(v) })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Объект создан");
      navigate({ to: "/properties/$id", params: { id: data.id } });
    },
    onError: (e) => toast.error(humanError(e, "Не удалось создать объект")),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">Новый объект</h1>
      <PropertyForm
        formId="property-new-form"
        initial={folder ? { folder_id: folder } : undefined}
        onSubmit={(v) => mut.mutate(v)}
        submitting={mut.isPending}
      />
      <MobileActionBar>
        <Button
          type="submit"
          form="property-new-form"
          size="lg"
          className="flex-1 min-h-11"
          disabled={mut.isPending}
        >
          {mut.isPending ? "Сохранение..." : "Создать объект"}
        </Button>
      </MobileActionBar>
    </div>
  );
}
