import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listMyLinks, linkUserByEmail, unlinkUser } from "@/lib/user-links.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const fetchLinks = useServerFn(listMyLinks);
  const linkFn = useServerFn(linkUserByEmail);
  const unlinkFn = useServerFn(unlinkUser);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "tenant">("tenant");

  const q = useQuery({ queryKey: ["my-links"], queryFn: () => fetchLinks() });

  const linkMut = useMutation({
    mutationFn: () => linkFn({ data: { email, role } }),
    onSuccess: () => {
      toast.success("Привязано");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["my-links"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unlinkMut = useMutation({
    mutationFn: (linkId: string) => unlinkFn({ data: { linkId } }),
    onSuccess: () => {
      toast.success("Отвязано");
      qc.invalidateQueries({ queryKey: ["my-links"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const links = q.data ?? [];
  const managers = links.filter((l: any) => l.role === "manager");
  const tenants = links.filter((l: any) => l.role === "tenant");

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">Пользователи</h1>

      <Card>
        <CardHeader>
          <CardTitle>Привязать пользователя</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-[1fr,180px,auto] gap-2 items-end">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                type="email"
              />
            </div>
            <div className="space-y-1">
              <Label>Роль</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "manager" | "tenant")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant">Арендатор</SelectItem>
                  <SelectItem value="manager">Менеджер</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => linkMut.mutate()} disabled={!email || linkMut.isPending}>
              Привязать
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Пользователь должен быть уже зарегистрирован. Будет добавлена соответствующая роль и
            связь с вашим аккаунтом.
          </p>
        </CardContent>
      </Card>

      <LinksTable title="Менеджеры" rows={managers} onUnlink={(id) => unlinkMut.mutate(id)} />
      <LinksTable title="Арендаторы" rows={tenants} onUnlink={(id) => unlinkMut.mutate(id)} />
    </div>
  );
}

function LinksTable({
  title,
  rows,
  onUnlink,
}: {
  title: string;
  rows: any[];
  onUnlink: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title}{" "}
          <Badge variant="outline" className="ml-1">
            {rows.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Нет привязанных пользователей.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Имя</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Привязан</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.member_full_name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.member_email ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("ru-RU")}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => onUnlink(r.id)}>
                      Отвязать
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
