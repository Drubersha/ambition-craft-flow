import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ContractStatusBadge } from "@/components/status-badges";
import { Plus, FileText, Search } from "lucide-react";
import { useState } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { FolderFilterBar, useFolderFilter } from "@/components/folder-filter";

export const Route = createFileRoute("/_authenticated/contracts/")({
  component: ContractsList,
});

function ContractsList() {
  const [q, setQ] = useState("");
  // Договоры фильтруются с учётом вложенных папок.
  const folderFilter = useFolderFilter({ includeDescendants: true });
  const { data, isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, tenant:tenants(name), property:properties(name, folder_id, is_general)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Для надписей: какие объекты обозначены на картах и какие договоры составные.
  const { data: coverage } = useQuery({
    queryKey: ["contracts-coverage"],
    queryFn: async () => {
      const [mk, cp] = await Promise.all([
        supabase.from("property_markings").select("property_id"),
        supabase.from("contract_properties").select("contract_id,property_id"),
      ]);
      if (mk.error) throw mk.error;
      if (cp.error) throw cp.error;
      const marked = new Set((mk.data ?? []).map((m) => m.property_id));
      const linksByContract = new Map<string, string[]>();
      for (const l of cp.data ?? []) {
        const arr = linksByContract.get(l.contract_id) ?? [];
        arr.push(l.property_id);
        linksByContract.set(l.contract_id, arr);
      }
      return { marked, linksByContract };
    },
  });

  // Активные договоры аренды на общих объектах («Машиноместа», остаток земли):
  // без привязки к конкретному месту/участку. Составные (со связками) — привязаны.
  const activeRent = (data ?? []).filter((c: any) => c.status === "active" && c.kind !== "ahch");
  const onGeneral = coverage
    ? activeRent.filter((c: any) => c.property?.is_general && !coverage.linksByContract.has(c.id))
    : [];
  // Договор «не на карте», если ни его объект, ни объекты его связок не размечены.
  const unmapped = coverage
    ? activeRent.filter((c: any) => {
        if (coverage.marked.has(c.property_id)) return false;
        const linked = coverage.linksByContract.get(c.id) ?? [];
        return !linked.some((pid) => coverage.marked.has(pid));
      })
    : [];

  const filtered = (data ?? []).filter((c: any) => {
    if (!folderFilter.matches(c.property?.folder_id)) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      (c.number?.toLowerCase() || "").includes(s) ||
      c.tenant?.name.toLowerCase().includes(s) ||
      c.property?.name.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Договоры"
        description="Все договоры аренды"
        action={
          <Button asChild size="sm">
            <Link to="/contracts/new">
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
          aria-label="Поиск договоров"
          type="search"
          placeholder="Поиск по номеру, арендатору, объекту"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <FolderFilterBar filter={folderFilter} placeholder="Фильтр по папке (вкл. вложенные)" />
      {coverage && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div
            title={onGeneral.map((c: any) => c.tenant?.name ?? c.number).join(", ") || undefined}
          >
            Договоров без объекта (на общих контурах) — {onGeneral.length}
          </div>
          <div title={unmapped.map((c: any) => c.tenant?.name ?? c.number).join(", ") || undefined}>
            Договоров без обозначения на карте — {unmapped.length}
          </div>
        </div>
      )}
      {isLoading ? (
        <div>Загрузка...</div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold">Договоров нет</h3>
          <p className="text-sm text-muted-foreground mb-4">Создайте первый договор.</p>
          <Button asChild>
            <Link to="/contracts/new">
              <Plus className="h-4 w-4 mr-1" /> Добавить
            </Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c: any) => (
            <Link key={c.id} to="/contracts/$id" params={{ id: c.id }}>
              <Card className="p-4 hover:border-primary transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium break-all">
                        {c.number ? `№ ${c.number}` : "Без номера"}
                      </span>
                      <ContractStatusBadge status={c.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 break-words">
                      {c.tenant?.name} · {c.property?.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(c.start_date)} → {formatDate(c.end_date)} · {c.area ?? "—"} м²
                    </div>
                  </div>
                  <div className="text-right font-semibold shrink-0 text-sm sm:text-base whitespace-nowrap">
                    {formatMoney(c.rate, c.currency)}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
