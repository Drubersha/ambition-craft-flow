import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Building2, Search, Folder } from "lucide-react";
import { useState } from "react";
import { PROPERTY_STATUS_LABELS, PROPERTY_TYPE_LABELS, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { FolderFilterBar, useFolderFilter } from "@/components/folder-filter";
import { folderBreadcrumb } from "@/lib/folders";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FoldersView } from "@/components/folders-view";

export const Route = createFileRoute("/_authenticated/properties/")({
  component: PropertiesPage,
});

function PropertiesPage() {
  return (
    <div className="space-y-4">
      {/* Папки — первыми: карты объектов живут в папках, с них и начинают. */}
      <Tabs defaultValue="folders">
        <TabsList>
          <TabsTrigger value="folders">Папки</TabsTrigger>
          <TabsTrigger value="list">Список</TabsTrigger>
        </TabsList>
        <TabsContent value="folders" className="mt-4">
          <FoldersView />
        </TabsContent>
        <TabsContent value="list" className="mt-4">
          <PropertiesList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PropertiesList() {
  const [q, setQ] = useState("");
  // Объекты фильтруются по точному совпадению папки, без вложенных.
  const folderFilter = useFolderFilter({ includeDescendants: false });
  const folders = folderFilter.folders;
  const { data, isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = (data ?? []).filter((p) => {
    if (!folderFilter.matches(p.folder_id)) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      p.name.toLowerCase().includes(s) ||
      p.address.toLowerCase().includes(s) ||
      (p.cadastral_no ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Объекты"
        description="Помещения и здания в аренде"
        action={
          <Button asChild size="sm">
            <Link to="/properties/new">
              <Plus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Добавить</span>
            </Link>
          </Button>
        }
      />

      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          aria-label="Поиск объектов"
          type="search"
          placeholder="Поиск по названию, адресу, кадастру"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <FolderFilterBar filter={folderFilter} placeholder="Фильтр по папке" />

      {isLoading ? (
        <div>Загрузка...</div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <Link key={p.id} to="/properties/$id" params={{ id: p.id }}>
              <Card className="p-4 hover:border-primary transition-colors h-full">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.address}</div>
                  </div>
                  <Badge variant="secondary">{PROPERTY_STATUS_LABELS[p.status]}</Badge>
                </div>
                <div className="mt-3 text-xs text-muted-foreground space-y-0.5">
                  <div>
                    {PROPERTY_TYPE_LABELS[p.type]} · {p.area_total} м²
                  </div>
                  {p.base_rate && <div>Ставка: {formatMoney(p.base_rate, p.currency)}</div>}
                  {p.cadastral_no && <div>Кадастр: {p.cadastral_no}</div>}
                  {p.folder_id && (
                    <div className="flex items-center gap-1 truncate">
                      <Folder
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span className="truncate">{folderBreadcrumb(folders, p.folder_id)}</span>
                    </div>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="p-12 text-center">
      <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
      <h3 className="font-semibold">Объектов ещё нет</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Добавьте первый объект, чтобы начать учёт.
      </p>
      <Button asChild>
        <Link to="/properties/new">
          <Plus className="h-4 w-4 mr-1" /> Добавить объект
        </Link>
      </Button>
    </Card>
  );
}
