import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getUserOverview, moderatorUpdateProfile, ownerSetRole } from "@/lib/admin.functions";
import { getActivityLogs } from "@/lib/activity-log.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/user/$userId")({
  component: UserOverviewPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Не найдено</div>,
});

const ADMIN_ROLES = ["developer", "moderator", "owner"] as const;

function UserOverviewPage() {
  const { userId } = Route.useParams();
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getUserOverview);
  const fetchLogs = useServerFn(getActivityLogs);
  const updateProfile = useServerFn(moderatorUpdateProfile);
  const setRole = useServerFn(ownerSetRole);

  const q = useQuery({
    queryKey: ["admin-user-overview", userId],
    queryFn: () => fetchOverview({ data: { userId } }),
  });
  const logsQ = useQuery({
    queryKey: ["admin-user-logs", userId],
    queryFn: () => fetchLogs({ data: { user_id: userId, limit: 100 } }),
    enabled: !!q.data,
  });

  const [name, setName] = useState<string | null>(null);

  const profileMut = useMutation({
    mutationFn: () => updateProfile({ data: { userId, full_name: name } }),
    onSuccess: () => {
      toast.success("Профиль обновлён");
      qc.invalidateQueries({ queryKey: ["admin-user-overview", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMut = useMutation({
    mutationFn: (vars: { role: (typeof ADMIN_ROLES)[number]; grant: boolean }) =>
      setRole({ data: { userId, role: vars.role, grant: vars.grant } }),
    onSuccess: () => {
      toast.success("Роль обновлена");
      qc.invalidateQueries({ queryKey: ["admin-user-overview", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Загрузка…</div>;
  if (q.error) return <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>;
  if (!q.data) return null;

  const data = q.data;
  const isOwner = data.viewerRoles.includes("owner");
  const canEdit = isOwner || data.viewerRoles.includes("moderator");
  const displayName = name ?? data.profile?.full_name ?? "";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/admin/users" className="text-sm text-muted-foreground hover:underline">← К списку</Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{data.profile?.full_name ?? data.email ?? userId}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">Email: </span>{data.email ?? "—"}</div>
            <div><span className="text-muted-foreground">Создан: </span>{data.created_at ? new Date(data.created_at).toLocaleString("ru-RU") : "—"}</div>
            <div><span className="text-muted-foreground">Последний вход: </span>{data.last_sign_in_at ? new Date(data.last_sign_in_at).toLocaleString("ru-RU") : "—"}</div>
            <div className="flex flex-wrap items-center gap-1"><span className="text-muted-foreground">Роли: </span>
              {data.roles.length === 0 ? "—" : data.roles.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}
            </div>
          </div>
          {canEdit && (
            <div className="border-t pt-3 space-y-2">
              <Label>Имя</Label>
              <div className="flex gap-2">
                <Input value={displayName} onChange={(e) => setName(e.target.value)} />
                <Button onClick={() => profileMut.mutate()} disabled={profileMut.isPending}>Сохранить</Button>
              </div>
            </div>
          )}
          {isOwner && (
            <div className="border-t pt-3 space-y-2">
              <div className="text-sm font-medium">Управление ролями</div>
              {ADMIN_ROLES.map((r) => {
                const has = data.roles.includes(r);
                return (
                  <div key={r} className="flex items-center justify-between max-w-sm">
                    <span>{r}</span>
                    <Switch checked={has} onCheckedChange={(v) => roleMut.mutate({ role: r, grant: v })} disabled={roleMut.isPending} />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="properties">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="properties">Объекты ({data.properties.length})</TabsTrigger>
          <TabsTrigger value="tenants">Арендаторы ({data.tenants.length})</TabsTrigger>
          <TabsTrigger value="contracts">Договоры ({data.contracts.length})</TabsTrigger>
          <TabsTrigger value="payments">Оплаты ({data.payments.length})</TabsTrigger>
          <TabsTrigger value="tasks">Задачи ({data.tasks.length})</TabsTrigger>
          <TabsTrigger value="logs">Логи</TabsTrigger>
        </TabsList>
        <TabsContent value="properties">
          <SimpleTable rows={data.properties} columns={[["name","Название"],["status","Статус"],["area_total","Площадь"]]} />
        </TabsContent>
        <TabsContent value="tenants">
          <SimpleTable rows={data.tenants} columns={[["name","Имя"],["phone","Телефон"],["email","Email"]]} />
        </TabsContent>
        <TabsContent value="contracts">
          <SimpleTable rows={data.contracts} columns={[["kind","Тип"],["status","Статус"],["start_date","С"],["end_date","По"],["monthly_amount","Месяц"]]} formatter={{ monthly_amount: (v) => formatMoney(Number(v) || 0) }} />
        </TabsContent>
        <TabsContent value="payments">
          <SimpleTable rows={data.payments} columns={[["paid_at","Дата"],["amount","Сумма"]]} formatter={{ amount: (v) => formatMoney(Number(v) || 0) }} />
        </TabsContent>
        <TabsContent value="tasks">
          <SimpleTable rows={data.tasks} columns={[["title","Задача"],["status","Статус"],["due_at","Срок"]]} />
        </TabsContent>
        <TabsContent value="logs">
          <Card><CardContent className="pt-4">
            {logsQ.isLoading ? <div className="text-sm text-muted-foreground">Загрузка…</div> :
              <Table>
                <TableHeader><TableRow><TableHead>Дата</TableHead><TableHead>Действие</TableHead><TableHead>Сущность</TableHead><TableHead>Маршрут</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(logsQ.data?.rows ?? []).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{new Date(r.created_at).toLocaleString("ru-RU")}</TableCell>
                      <TableCell><Badge variant="outline">{r.action}</Badge></TableCell>
                      <TableCell className="text-xs">{r.entity_type ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.route ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            }
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SimpleTable({ rows, columns, formatter }: { rows: any[]; columns: [string, string][]; formatter?: Record<string, (v: any) => string> }) {
  return (
    <Card><CardContent className="pt-4">
      {rows.length === 0 ? <div className="text-sm text-muted-foreground">Нет данных.</div> :
        <Table>
          <TableHeader><TableRow>{columns.map(([k, l]) => <TableHead key={k}>{l}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.id ?? i}>
                {columns.map(([k]) => <TableCell key={k} className="text-sm">{formatter?.[k] ? formatter[k](r[k]) : (r[k] ?? "—")}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    </CardContent></Card>
  );
}