import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PropertyForm, type PropertyFormValues } from "@/components/property-form";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { MobileCollapsible } from "@/components/mobile-collapsible";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { ConfirmButton } from "@/components/confirm-button";
import { PlanUploader } from "@/components/plan-uploader";
import { useFolders, folderBreadcrumb } from "@/lib/folders";

export const Route = createFileRoute("/_authenticated/properties/$id")({
  component: EditProperty,
});

function EditProperty() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const mut = useMutation({
    mutationFn: async (v: PropertyFormValues) => {
      const { error } = await supabase.from("properties").update({
        name: v.name, address: v.address, type: v.type as any, status: v.status as any,
        cadastral_no: v.cadastral_no || null,
        area_total: Number(v.area_total) || 0,
        area_usable: v.area_usable ? Number(v.area_usable) : null,
        floor: v.floor || null, room_no: v.room_no || null,
        base_rate: v.base_rate ? Number(v.base_rate) : null,
        currency: v.currency || "RUB", description: v.description || null,
        folder_id: v.folder_id,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property", id] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Сохранено");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("properties").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Удалено");
      navigate({ to: "/properties" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !data) return <div>Загрузка...</div>;

  const folders = (Route as any) && undefined; // placeholder to satisfy linter

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/properties"><ArrowLeft className="h-4 w-4 mr-1" /> К списку</Link>
        </Button>
        <ConfirmButton
          variant="destructive"
          size="sm"
          className="hidden md:inline-flex"
          destructive
          title="Удалить объект?"
          description="Объект будет удалён вместе со связанными данными. Действие необратимо."
          confirmText="Удалить"
          onConfirm={() => del.mutate()}
        >
          <Trash2 className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Удалить</span>
        </ConfirmButton>
      </div>
      <h1 className="text-xl sm:text-2xl font-bold break-words">{data.name}</h1>
      <FolderCrumb folderId={data.folder_id} />
      <MobileCollapsible title="Данные объекта">
        <PropertyForm
          formId="property-form"
          initial={{
            name: data.name, address: data.address, type: data.type, cadastral_no: data.cadastral_no ?? "",
            area_total: String(data.area_total ?? ""), area_usable: data.area_usable ? String(data.area_usable) : "",
            floor: data.floor ?? "", room_no: data.room_no ?? "", status: data.status,
            base_rate: data.base_rate ? String(data.base_rate) : "", currency: data.currency, description: data.description ?? "",
            folder_id: data.folder_id ?? null,
          }}
          onSubmit={(v) => mut.mutate(v)}
          submitting={mut.isPending}
        />
      </MobileCollapsible>

      <MobileCollapsible title="План объекта">
        <PlanUploader
          pathPrefix={`property-plans/${id}`}
          currentPath={data.plan_path}
          currentMime={data.plan_mime}
          onChange={async (p) => {
            const { error } = await supabase.from("properties")
              .update({ plan_path: p.path, plan_mime: p.mime })
              .eq("id", id);
            if (error) throw error;
            qc.invalidateQueries({ queryKey: ["property", id] });
          }}
        />
      </MobileCollapsible>

      <MobileActionBar>
        <ConfirmButton
          variant="destructive"
          size="lg"
          className="flex-1 min-h-11"
          destructive
          title="Удалить объект?"
          description="Объект будет удалён вместе со связанными данными. Действие необратимо."
          confirmText="Удалить"
          onConfirm={() => del.mutate()}
        >
          <Trash2 className="h-4 w-4 mr-1" /> Удалить
        </ConfirmButton>
        <Button
          type="submit"
          form="property-form"
          size="lg"
          className="flex-1 min-h-11"
          disabled={mut.isPending}
        >
          {mut.isPending ? "Сохранение..." : "Сохранить"}
        </Button>
      </MobileActionBar>
    </div>
  );
}