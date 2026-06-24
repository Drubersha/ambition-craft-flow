import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllUsers, getCurrentAdminRoles } from "@/lib/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Не найдено</div>,
});

function UsersPage() {
  const fetchRoles = useServerFn(getCurrentAdminRoles);
  const fetchUsers = useServerFn(listAllUsers);
  const rolesQ = useQuery({ queryKey: ["admin-roles"], queryFn: () => fetchRoles() });
  const isAdmin = (rolesQ.data?.roles?.length ?? 0) > 0;
  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => fetchUsers(), enabled: isAdmin });

  if (rolesQ.isLoading) return <div className="p-6 text-sm text-muted-foreground">Загрузка…</div>;
  if (!isAdmin) return <div className="p-6 text-sm text-destructive">Доступ только для администраторов.</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Пользователи</h1>
      <Card>
        <CardContent className="pt-4">
          {q.isLoading ? <div className="text-sm text-muted-foreground">Загрузка…</div> :
           q.error ? <div className="text-sm text-destructive">{(q.error as Error).message}</div> :
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Роли</TableHead>
                  <TableHead>Последний вход</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.full_name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email ?? "—"}</TableCell>
                    <TableCell className="space-x-1">
                      {u.roles.length === 0 ? <span className="text-xs text-muted-foreground">—</span>
                        : u.roles.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}
                    </TableCell>
                    <TableCell className="text-xs">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("ru-RU") : "—"}</TableCell>
                    <TableCell>
                      <Link to="/admin/user/$userId" params={{ userId: u.id }} className="text-sm text-primary hover:underline">Открыть</Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        </CardContent>
      </Card>
    </div>
  );
}