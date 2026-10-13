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
import { Plus, Users, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { TENANT_KIND_LABELS } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/tenants/")({
  component: TenantsList,
});

type Row = {
  id: string;
  name: string;
  kind: string;
  inn: string | null;
  phone: string | null;
  email: string | null;
  contacts: { phone: string | null; email: string | null; sort_order: number }[] | null;
};

/** Телефон арендатора: из карточки, иначе — у основного контактного лица. */
function tenantPhone(t: Row): string {
  if (t.phone) return t.phone;
  const first = [...(t.contacts ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
  return first?.phone ?? "";
}

function TenantsList() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select(
          "id, name, kind, inn, phone, email, contacts:tenant_contacts(phone, email, sort_order)",
        )
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? [])
      .map((t) => ({ ...t, phoneText: tenantPhone(t) }))
      .filter((t) => {
        if (!s) return true;
        return (
          t.name.toLowerCase().includes(s) ||
          (t.inn ?? "").toLowerCase().includes(s) ||
          t.phoneText.toLowerCase().includes(s) ||
          (t.email ?? "").toLowerCase().includes(s)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [data, q]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Арендаторы"
        description="База контактов арендаторов"
        action={
          <Button asChild size="sm">
            <Link to="/tenants/new">
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
          aria-label="Поиск арендаторов"
          type="search"
          placeholder="Поиск по имени, ИНН, телефону, email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {isLoading ? (
        <div>Загрузка...</div>
      ) : (data ?? []).length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold">Арендаторов нет</h3>
          <p className="text-sm text-muted-foreground mb-4">Добавьте первого арендатора.</p>
          <Button asChild>
            <Link to="/tenants/new">
              <Plus className="h-4 w-4 mr-1" /> Добавить
            </Link>
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Ничего не найдено.</Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead className="w-40">ИНН</TableHead>
                <TableHead className="w-44">Телефон</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer"
                  onClick={() => navigate({ to: "/tenants/$id", params: { id: t.id } })}
                >
                  <TableCell className="min-w-0">
                    <Link
                      to="/tenants/$id"
                      params={{ id: t.id }}
                      className="font-medium hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t.name}
                    </Link>
                    {t.kind !== "company" && (
                      <Badge variant="secondary" className="ml-2 align-middle">
                        {TENANT_KIND_LABELS[t.kind]}
                      </Badge>
                    )}
                    {/* На узком экране ИНН и телефон переносятся под название. */}
                    <div className="sm:hidden text-xs text-muted-foreground mt-0.5">
                      {[t.inn && `ИНН ${t.inn}`, t.phoneText].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell tabular-nums text-muted-foreground">
                    {t.inn || "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell tabular-nums">
                    {t.phoneText ? (
                      <a
                        href={`tel:${t.phoneText.replace(/[^\d+]/g, "")}`}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t.phoneText}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
