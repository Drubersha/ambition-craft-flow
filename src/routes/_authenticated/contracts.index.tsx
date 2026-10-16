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
import { ContractStatusBadge } from "@/components/status-badges";
import { Plus, FileText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  formatDate,
  formatMoney,
  formatNum,
  monthlyPayment,
  leaseUnitShort,
  rateLabel,
} from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { FolderFilterBar, useFolderFilter } from "@/components/folder-filter";
import { excludeAmendments } from "@/lib/dashboard";

export const Route = createFileRoute("/_authenticated/contracts/")({
  component: ContractsList,
});

function ContractsList() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"active" | "all">("active");
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

  // Допсоглашения — не отдельные строки: у родителя показываем их число.
  const amendmentsByParent = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of (data ?? []) as any[]) {
      if (c.parent_contract_id) m.set(c.parent_contract_id, (m.get(c.parent_contract_id) ?? 0) + 1);
    }
    return m;
  }, [data]);
  const mainContracts = useMemo(() => excludeAmendments(((data ?? []) as any[]) ?? []), [data]);

  // Активные договоры аренды на общих объектах («Машиноместа», остаток земли):
  // без привязки к конкретному месту/участку. Составные (со связками) — привязаны.
  const activeRent = mainContracts.filter((c: any) => c.status === "active" && c.kind !== "ahch");
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

  const filtered = mainContracts.filter((c: any) => {
    if (status === "active" && c.status !== "active") return false;
    if (!folderFilter.matches(c.property?.folder_id)) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      (c.number?.toLowerCase() || "").includes(s) ||
      (c.tenant?.name ?? "").toLowerCase().includes(s) ||
      (c.property?.name ?? "").toLowerCase().includes(s)
    );
  });

  const monthlyTotal = filtered.reduce(
    (s: number, c: any) =>
      c.kind === "ahch"
        ? s
        : s + monthlyPayment(Number(c.rate), c.payment_period, Number(c.area || 0)),
    0,
  );

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
      <div className="flex flex-wrap items-center gap-2">
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
        <div className="inline-flex rounded-md border bg-background p-0.5 text-xs">
          {(["active", "all"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setStatus(k)}
              className={
                "rounded px-3 py-1.5 transition-colors " +
                (status === k
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {k === "active" ? "Активные" : "Все"}
            </button>
          ))}
        </div>
      </div>
      {coverage && (onGeneral.length > 0 || unmapped.length > 0) && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {onGeneral.length > 0 && (
            <div title={onGeneral.map((c: any) => c.tenant?.name ?? c.number).join(", ")}>
              На общих объектах без привязки к конкретному месту — {onGeneral.length}
            </div>
          )}
          {unmapped.length > 0 && (
            <div title={unmapped.map((c: any) => c.tenant?.name ?? c.number).join(", ")}>
              Не обозначены на плане — {unmapped.length}
            </div>
          )}
        </div>
      )}
      {isLoading ? (
        <div>Загрузка...</div>
      ) : mainContracts.length === 0 ? (
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
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Ничего не найдено — измените поиск или фильтры.
        </Card>
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            {filtered.length} догов.{" "}
            {status === "active" && (
              <>
                · в месяц{" "}
                <span className="font-semibold text-foreground">{formatMoney(monthlyTotal)}</span>
              </>
            )}
          </div>
          <Card className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Договор</TableHead>
                  <TableHead>Арендатор</TableHead>
                  <TableHead className="hidden md:table-cell">Объект</TableHead>
                  <TableHead className="hidden lg:table-cell">Срок</TableHead>
                  <TableHead className="hidden sm:table-cell text-right">Площадь</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Ставка</TableHead>
                  <TableHead className="text-right">В месяц</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c: any) => {
                  const monthly = monthlyPayment(
                    Number(c.rate),
                    c.payment_period,
                    Number(c.area || 0),
                  );
                  const ds = amendmentsByParent.get(c.id) ?? 0;
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => navigate({ to: "/contracts/$id", params: { id: c.id } })}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            to="/contracts/$id"
                            params={{ id: c.id }}
                            className="font-medium hover:underline whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {c.number ? `№ ${c.number}` : "Без номера"}
                          </Link>
                          <ContractStatusBadge status={c.status} />
                          {c.kind === "ahch" && <Badge variant="outline">АХЧ</Badge>}
                          {ds > 0 && (
                            <Badge variant="outline" title="Допсоглашений">
                              ДС: {ds}
                            </Badge>
                          )}
                        </div>
                        <div className="md:hidden text-xs text-muted-foreground mt-0.5">
                          {c.property?.name}
                          {c.end_date ? ` · до ${formatDate(c.end_date)}` : " · бессрочно"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate">{c.tenant?.name}</TableCell>
                      <TableCell className="hidden md:table-cell max-w-[200px] truncate">
                        {c.property?.name}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell whitespace-nowrap text-muted-foreground">
                        {formatDate(c.start_date)} → {c.end_date ? formatDate(c.end_date) : "∞"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-right tabular-nums whitespace-nowrap">
                        {c.area != null
                          ? `${formatNum(Number(c.area))} ${leaseUnitShort(c.unit)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right tabular-nums whitespace-nowrap text-muted-foreground">
                        {c.kind === "ahch" ? "—" : rateLabel(c)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">
                        {c.kind === "ahch" ? "—" : formatMoney(monthly, c.currency)}
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
