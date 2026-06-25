import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listAllUsers,
  getCurrentAdminRoles,
  adminCreateUser,
  adminDeleteUser,
  adminAddTenantRoleAndLink,
  type CreatableRole,
} from "@/lib/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmButton } from "@/components/confirm-button";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Не найдено</div>,
});

function UsersPage() {
  const qc = useQueryClient();
  const fetchRoles = useServerFn(getCurrentAdminRoles);
  const fetchUsers = useServerFn(listAllUsers);
  const createFn = useServerFn(adminCreateUser);
  const deleteFn = useServerFn(adminDeleteUser);
  const linkTenantFn = useServerFn(adminAddTenantRoleAndLink);
  const rolesQ = useQuery({ queryKey: ["admin-roles"], queryFn: () => fetchRoles() });
  const isAdmin = (rolesQ.data?.roles?.length ?? 0) > 0;
  const myUserId = rolesQ.data?.userId;
  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => fetchUsers(), enabled: isAdmin });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });
  const deleteMut = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Аккаунт удалён");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const linkTenantMut = useMutation({
    mutationFn: (vars: { memberUserId: string; ownerUserId: string }) =>
      linkTenantFn({ data: vars }),
    onSuccess: () => {
      toast.success("Привязано как арендатор");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (rolesQ.isLoading) return <div className="p-6 text-sm text-muted-foreground">Загрузка…</div>;
  if (!isAdmin)
    return <div className="p-6 text-sm text-destructive">Доступ только для администраторов.</div>;

  const owners = (q.data ?? []).filter((u) => u.roles.includes("owner"));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold">Пользователи</h1>
        <CreateUserDialog
          onCreate={async (input) => {
            await createFn({ data: input });
            toast.success("Аккаунт создан");
            refresh();
          }}
        />
      </div>
      <Card>
        <CardContent className="pt-4">
          {q.isLoading ? (
            <div className="text-sm text-muted-foreground">Загрузка…</div>
          ) : q.error ? (
            <div className="text-sm text-destructive">{(q.error as Error).message}</div>
          ) : (
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
                    <TableCell className="text-sm text-muted-foreground">
                      {u.email ?? "—"}
                    </TableCell>
                    <TableCell className="space-x-1">
                      {u.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        u.roles.map((r) => (
                          <Badge key={r} variant="outline">
                            {r}
                          </Badge>
                        ))
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleString("ru-RU")
                        : "—"}
                    </TableCell>
                    <TableCell className="space-x-2 whitespace-nowrap">
                      <Link
                        to="/admin/user/$userId"
                        params={{ userId: u.id }}
                        className="text-sm text-primary hover:underline"
                      >
                        Открыть
                      </Link>
                      <MakeTenantDialog
                        userLabel={u.full_name ?? u.email ?? u.id}
                        owners={owners.filter((o) => o.id !== u.id)}
                        onSubmit={(ownerUserId) =>
                          linkTenantMut.mutate({ memberUserId: u.id, ownerUserId })
                        }
                      />
                      {u.id !== myUserId && (
                        <ConfirmButton
                          size="sm"
                          variant="ghost"
                          destructive
                          title="Удалить аккаунт?"
                          description={`Аккаунт ${u.email ?? u.full_name ?? u.id} будет удалён без возможности восстановления.`}
                          confirmText="Удалить"
                          onConfirm={() => deleteMut.mutate(u.id)}
                        >
                          Удалить
                        </ConfirmButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateUserDialog({
  onCreate,
}: {
  onCreate: (input: {
    email: string;
    password: string;
    fullName?: string;
    role: CreatableRole;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<CreatableRole>("owner");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    try {
      await onCreate({ email, password, fullName: fullName || undefined, role });
      setOpen(false);
      setEmail("");
      setPassword("");
      setFullName("");
      setRole("owner");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const genPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let s = "";
    const arr = new Uint32Array(14);
    crypto.getRandomValues(arr);
    for (const n of arr) s += chars[n % chars.length];
    setPassword(s);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Создать аккаунт</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Создать аккаунт</DialogTitle>
          <DialogDescription>Аккаунт создаётся сразу с подтверждённой почтой.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>ФИО</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Иван Иванов"
            />
          </div>
          <div className="space-y-1">
            <Label>Пароль (мин. 8)</Label>
            <div className="flex gap-2">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button type="button" variant="outline" onClick={genPassword}>
                Сгенерировать
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Роль</Label>
            <select
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as CreatableRole)}
            >
              <option value="owner">Арендодатель</option>
              <option value="tenant">Арендатор</option>
              <option value="manager">Менеджер</option>
              <option value="moderator">Модератор</option>
              <option value="developer">Разработчик</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={pending || !email || password.length < 8}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MakeTenantDialog({
  userLabel,
  owners,
  onSubmit,
}: {
  userLabel: string;
  owners: Array<{ id: string; full_name: string | null; email: string | null }>;
  onSubmit: (ownerUserId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ownerId, setOwnerId] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Сделать арендатором
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Привязать как арендатора</DialogTitle>
          <DialogDescription>
            {userLabel} будет привязан к выбранному арендодателю и получит роль «арендатор».
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Арендодатель</Label>
          <select
            className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            <option value="">— выберите —</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name ?? o.email ?? o.id}
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button
            disabled={!ownerId}
            onClick={() => {
              onSubmit(ownerId);
              setOpen(false);
              setOwnerId("");
            }}
          >
            Привязать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
