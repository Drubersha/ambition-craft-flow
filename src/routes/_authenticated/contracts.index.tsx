import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Search } from "lucide-react";
import { useState } from "react";
import { CONTRACT_STATUS_LABELS, formatDate, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { FolderPicker } from "@/components/folder-picker";
import { useFolders, descendantIds } from "@/lib/folders";

export const Route = createFileRoute("/_authenticated/contracts/")({
  component: ContractsList,
});

function ContractsList() {
  const [q, setQ] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderFilterEnabled, setFolderFilterEnabled] = useState(false);
  const { data: folders = [] } = useFolders();
  const { data, isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts")
        .select("*, tenant:tenants(name), property:properties(name, folder_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = (data ?? []).filter((c: any) => {
    if (folderFilterEnabled) {
      const pf = c.property?.folder_id ?? null;
      if (folderId === null) {
        if (pf !== null) return false;
      } else {
        // include the folder and all of its descendants
        const allowed = descendantIds(folders, folderId);
        if (!pf || !allowed.has(pf)) return false;
      }
    }
    if (!q) return true;
    const s = q.toLowerCase();
    return c.number.toLowerCase().includes(s) || c.tenant?.name.toLowerCase().includes(s) || c.property?.name.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Договоры"
        description="Все договоры аренды"
        action={
          <Button asChild size="sm">
            <Link to="/contracts/new"><Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Добавить</span></Link>
          </Button>
        }
      />
      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" aria-label="Поиск договоров" type="search" placeholder="Поиск по номеру, арендатору, объекту" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="w-full sm:max-w-xs">
          <FolderPicker
            value={folderFilterEnabled ? folderId : null}
            onChange={(id) => { setFolderId(id); setFolderFilterEnabled(true); }}
            placeholder="Фильтр по папке (вкл. вложенные)"
          />
        </div>
        {folderFilterEnabled && (
          <button type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => { setFolderFilterEnabled(false); setFolderId(null); }}
          >Сбросить</button>
        )}
      </div>
      {isLoading ? <div>Загрузка...</div> : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold">Договоров нет</h3>
          <p className="text-sm text-muted-foreground mb-4">Создайте первый договор.</p>
          <Button asChild><Link to="/contracts/new"><Plus className="h-4 w-4 mr-1" /> Добавить</Link></Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c: any) => (
            <Link key={c.id} to="/contracts/$id" params={{ id: c.id }}>
              <Card className="p-4 hover:border-primary transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium break-all">№ {c.number}</span>
                      <Badge variant={c.status === "active" ? "default" : "secondary"}>
                        {CONTRACT_STATUS_LABELS[c.status]}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 break-words">
                      {c.tenant?.name} · {c.property?.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(c.start_date)} → {formatDate(c.end_date)} · {c.area ?? "—"} м²
                    </div>
                  </div>
                  <div className="text-right font-semibold shrink-0 text-sm sm:text-base whitespace-nowrap">{formatMoney(c.rate, c.currency)}</div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}