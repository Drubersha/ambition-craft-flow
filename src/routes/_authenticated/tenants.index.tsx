import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Search } from "lucide-react";
import { useState } from "react";
import { TENANT_KIND_LABELS } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/tenants/")({
  component: TenantsList,
});

function TenantsList() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = (data ?? []).filter((t) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      t.name.toLowerCase().includes(s) ||
      (t.inn ?? "").toLowerCase().includes(s) ||
      (t.phone ?? "").toLowerCase().includes(s) ||
      (t.email ?? "").toLowerCase().includes(s)
    );
  });

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
      ) : filtered.length === 0 ? (
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
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => (
            <Link key={t.id} to="/tenants/$id" params={{ id: t.id }}>
              <Card className="p-4 hover:border-primary transition-colors h-full">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium truncate">{t.name}</div>
                  <Badge variant="secondary">{TENANT_KIND_LABELS[t.kind]}</Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                  {t.inn && <div>ИНН: {t.inn}</div>}
                  {t.phone && <div>{t.phone}</div>}
                  {t.email && <div className="truncate">{t.email}</div>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
