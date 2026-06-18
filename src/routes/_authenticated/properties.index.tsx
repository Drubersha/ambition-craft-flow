import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Building2, Search } from "lucide-react";
import { useState } from "react";
import { PROPERTY_STATUS_LABELS, PROPERTY_TYPE_LABELS, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/properties/")({
  component: PropertiesList,
});

function PropertiesList() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("properties").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = (data ?? []).filter((p) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      p.name.toLowerCase().includes(s) ||
      p.address.toLowerCase().includes(s) ||
      (p.cadastral_no ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Объекты</h1>
          <p className="text-muted-foreground text-sm">Помещения и здания в аренде</p>
        </div>
        <Button asChild>
          <Link to="/properties/new"><Plus className="h-4 w-4 mr-1" /> Добавить</Link>
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Поиск по названию, адресу, кадастру" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {isLoading ? (
        <div>Загрузка...</div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <Link key={p.id} to="/properties/$id" params={{ id: p.id }}>
              <Card className="p-4 hover:border-primary transition-colors h-full">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.address}</div>
                  </div>
                  <Badge variant="secondary">{PROPERTY_STATUS_LABELS[p.status]}</Badge>
                </div>
                <div className="mt-3 text-xs text-muted-foreground space-y-0.5">
                  <div>{PROPERTY_TYPE_LABELS[p.type]} · {p.area_total} м²</div>
                  {p.base_rate && <div>Ставка: {formatMoney(p.base_rate, p.currency)}</div>}
                  {p.cadastral_no && <div>Кадастр: {p.cadastral_no}</div>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="p-12 text-center">
      <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
      <h3 className="font-semibold">Объектов ещё нет</h3>
      <p className="text-sm text-muted-foreground mb-4">Добавьте первый объект, чтобы начать учёт.</p>
      <Button asChild>
        <Link to="/properties/new"><Plus className="h-4 w-4 mr-1" /> Добавить объект</Link>
      </Button>
    </Card>
  );
}