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
import { humanError } from "@/lib/human-error";
import { propertyRowFromForm } from "@/lib/properties";

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
      const { error } = await supabase
        .from("properties")
        .update(propertyRowFromForm(v))
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property", id] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Сохранено");
    },
    onError: (e: any) => toast.error(humanError(e)),
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
    onError: (e: any) => toast.error(humanError(e)),
  });

  if (isLoading || !data) return <div>Загрузка...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/properties">
            <ArrowLeft className="h-4 w-4 mr-1" /> К списку
          </Link>
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
          <Trash2 className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Удалить</span>
        </ConfirmButton>
      </div>
      <h1 className="text-xl sm:text-2xl font-bold break-words">{data.name}</h1>
      <FolderCrumb folderId={data.folder_id} />
      <MobileCollapsible title="Данные объекта">
        <PropertyForm
          formId="property-form"
          initial={{
            name: data.name,
            address: data.address,
            type: data.type,
            cadastral_no: data.cadastral_no ?? "",
            area_total: String(data.area_total ?? ""),
            area_usable: data.area_usable ? String(data.area_usable) : "",
            floor: data.floor ?? "",
            room_no: data.room_no ?? "",
            status: data.status,
            base_rate: data.base_rate ? String(data.base_rate) : "",
            currency: data.currency,
            description: data.description ?? "",
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
            const { error } = await supabase
              .from("properties")
              .update({ plan_path: p.path, plan_mime: p.mime })
              .eq("id", id);
            if (error) throw error;
            qc.invalidateQueries({ queryKey: ["property", id] });
          }}
        />
      </MobileCollapsible>

      <MobileActionBar>
        <ConfirmButton
          variant="outline"
          size="icon"
          className="min-h-11 min-w-11 text-destructive border-destructive/40"
          aria-label="Удалить объект"
          destructive
          title="Удалить объект?"
          description="Объект будет удалён вместе со связанными данными. Действие необратимо."
          confirmText="Удалить"
          onConfirm={() => del.mutate()}
        >
          <Trash2 className="h-4 w-4" />
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

function FolderCrumb({ folderId }: { folderId: string | null }) {
  const { data: folders = [] } = useFolders();
  if (!folderId) return null;
  const path = folderBreadcrumb(folders, folderId);
  if (!path) return null;
  return <div className="text-sm text-muted-foreground">Папка: {path}</div>;
}
