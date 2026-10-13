import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Building2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PROPERTY_STATUS_LABELS, PROPERTY_TYPE_LABELS, formatMoney, formatNum } from "@/lib/format";
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
      {/* Один заголовок на обе вкладки: раньше пункт меню «Объекты» открывал страницу
          «Папки», а кнопка добавления объекта была спрятана во второй вкладке. */}
      <PageHeader
        title="Объекты"
        description="Помещения, участки и места; папки группируют их и хранят планы"
        action={
          <Button asChild size="sm">
            <Link to="/properties/new">
              <Plus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Объект</span>
            </Link>
          </Button>
        }
      />
      {/* Папки — первыми: карты объектов живут в папках, с них и начинают. */}
      <Tabs defaultValue="folders">
        <TabsList>
          <TabsTrigger value="folders">Папки и планы</TabsTrigger>
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

const UNIT_SHORT: Record<string, string> = { sqm: "м²", space: "мест", lot: "лотов" };

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "free") return "destructive";
  if (status === "occupied") return "default";
  return "secondary";
}

function PropertiesList() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  // Объекты фильтруются по точному совпадению папки, без вложенных.
  const folderFilter = useFolderFilter({ includeDescendants: false });
  const folders = folderFilter.folders;
  const { data, isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? [])
      .filter((p) => {
        if (!folderFilter.matches(p.folder_id)) return false;
        if (!s) return true;
        return (
          p.name.toLowerCase().includes(s) ||
          p.address.toLowerCase().includes(s) ||
          (p.cadastral_no ?? "").toLowerCase().includes(s)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru", { numeric: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, q, folderFilter.enabled, folderFilter.folderId, folders]);

  const totalArea = filtered.reduce((s, p) => s + Number(p.area_total || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
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
      </div>

      {isLoading ? (
        <div>Загрузка...</div>
      ) : (data ?? []).length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Ничего не найдено — измените поиск или фильтр.
        </Card>
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            {filtered.length} объект. · площадь{" "}
            <span className="font-semibold text-foreground">{formatNum(totalArea)} м²</span>
          </div>
          <Card className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Объект</TableHead>
                  <TableHead className="hidden md:table-cell">Папка</TableHead>
                  <TableHead className="hidden sm:table-cell">Тип</TableHead>
                  <TableHead className="text-right">Площадь</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Ставка</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const unit = (p as { unit?: string }).unit ?? "sqm";
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => navigate({ to: "/properties/$id", params: { id: p.id } })}
                    >
                      <TableCell className="min-w-0">
                        <Link
                          to="/properties/$id"
                          params={{ id: p.id }}
                          className="font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {p.name}
                        </Link>
                        <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                          {p.address}
                          <span className="sm:hidden"> · {PROPERTY_TYPE_LABELS[p.type]}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground max-w-[220px] truncate">
                        {p.folder_id ? folderBreadcrumb(folders, p.folder_id) : "—"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground whitespace-nowrap">
                        {PROPERTY_TYPE_LABELS[p.type]}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatNum(Number(p.area_total))} {UNIT_SHORT[unit] ?? "м²"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right tabular-nums whitespace-nowrap text-muted-foreground">
                        {p.base_rate ? formatMoney(p.base_rate, p.currency) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(p.status)} className="whitespace-nowrap">
                          {PROPERTY_STATUS_LABELS[p.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
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
