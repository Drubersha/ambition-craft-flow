import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { getActivityLogs } from "@/lib/activity-log.functions";
import { getCurrentAdminRoles } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const searchSchema = z.object({
  user_id: fallback(z.string().optional(), undefined),
  action: fallback(z.string().optional(), undefined),
  entity_type: fallback(z.string().optional(), undefined),
  from: fallback(z.string().optional(), undefined),
  to: fallback(z.string().optional(), undefined),
  search: fallback(z.string().optional(), undefined),
  page: fallback(z.number().int().min(0), 0).default(0),
});

export const Route = createFileRoute("/_authenticated/admin/logs")({
  validateSearch: zodValidator(searchSchema),
  component: LogsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Не найдено</div>,
});

const PAGE = 50;

function LogsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/logs" });
  const fetchLogs = useServerFn(getActivityLogs);
  const fetchRoles = useServerFn(getCurrentAdminRoles);

  const rolesQ = useQuery({ queryKey: ["admin-roles"], queryFn: () => fetchRoles() });
  const isAdmin = (rolesQ.data?.roles?.length ?? 0) > 0;

  const q = useQuery({
    queryKey: ["activity-logs", search],
    queryFn: () => fetchLogs({ data: { ...search, limit: PAGE, offset: (search.page ?? 0) * PAGE } }),
    enabled: isAdmin,
  });

  if (rolesQ.isLoading) return <div className="p-6 text-sm text-muted-foreground">Загрузка…</div>;
  if (!isAdmin) return <div className="p-6 text-sm text-destructive">Доступ только для администраторов.</div>;

  const update = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch, page: 0 }) });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Журнал действий</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Фильтры</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <Input placeholder="Поиск (маршрут, действие)" value={search.search ?? ""}
            onChange={(e) => update({ search: e.target.value || undefined })} />
          <Select value={search.action ?? "all"} onValueChange={(v) => update({ action: v === "all" ? undefined : v })}>
            <SelectTrigger><SelectValue placeholder="Действие" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все действия</SelectItem>
              <SelectItem value="login">Вход</SelectItem>
              <SelectItem value="logout">Выход</SelectItem>
              <SelectItem value="view">Просмотр</SelectItem>
              <SelectItem value="create">Создание</SelectItem>
              <SelectItem value="update">Изменение</SelectItem>
              <SelectItem value="delete">Удаление</SelectItem>
              <SelectItem value="moderator_action">Модерация</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Тип сущности" value={search.entity_type ?? ""}
            onChange={(e) => update({ entity_type: e.target.value || undefined })} />
          <Input type="date" value={search.from?.slice(0, 10) ?? ""}
            onChange={(e) => update({ from: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
          <Input type="date" value={search.to?.slice(0, 10) ?? ""}
            onChange={(e) => update({ to: e.target.value ? new Date(e.target.value + "T23:59:59").toISOString() : undefined })} />
          <Input placeholder="ID пользователя" value={search.user_id ?? ""}
            onChange={(e) => update({ user_id: e.target.value || undefined })} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {q.isLoading ? <div className="text-sm text-muted-foreground">Загрузка…</div> :
           q.error ? <div className="text-sm text-destructive">{(q.error as Error).message}</div> :
           (q.data?.rows?.length ?? 0) === 0 ? <div className="text-sm text-muted-foreground">Записей нет.</div> :
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Пользователь</TableHead>
                    <TableHead>Действие</TableHead>
                    <TableHead>Сущность</TableHead>
                    <TableHead>Маршрут / детали</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.data!.rows.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString("ru-RU")}</TableCell>
                      <TableCell className="text-sm">
                        <div>{r.user_name ?? r.user_id?.slice(0, 8) ?? "—"}</div>
                        {r.acted_as_user_id && <div className="text-xs text-muted-foreground">от лица: {r.acted_as_name ?? r.acted_as_user_id.slice(0, 8)}</div>}
                      </TableCell>
                      <TableCell><Badge variant="outline">{r.action}</Badge></TableCell>
                      <TableCell className="text-xs">
                        {r.entity_type ? <div>{r.entity_type}</div> : null}
                        {r.entity_id ? <div className="text-muted-foreground">{r.entity_id.slice(0, 8)}</div> : null}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.route ? <div>{r.route}</div> : null}
                        {r.metadata && Object.keys(r.metadata).length > 0 && (
                          <details className="text-muted-foreground">
                            <summary className="cursor-pointer">детали</summary>
                            <pre className="text-[10px] whitespace-pre-wrap">{JSON.stringify(r.metadata, null, 2)}</pre>
                          </details>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between pt-3 text-sm">
                <div className="text-muted-foreground">Всего: {q.data!.total}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={(search.page ?? 0) === 0}
                    onClick={() => navigate({ search: (p) => ({ ...p, page: Math.max(0, (p.page ?? 0) - 1) }) })}>
                    Назад
                  </Button>
                  <Button size="sm" variant="outline" disabled={((search.page ?? 0) + 1) * PAGE >= q.data!.total}
                    onClick={() => navigate({ search: (p) => ({ ...p, page: (p.page ?? 0) + 1 }) })}>
                    Вперёд
                  </Button>
                </div>
              </div>
            </>
          }
        </CardContent>
      </Card>
    </div>
  );
}