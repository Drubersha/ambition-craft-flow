import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDemoIdentity } from "@/lib/demo-identity";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { SuggestionsPanel } from "@/components/tasks/suggestions-panel";

export const Route = createFileRoute("/_authenticated/tasks/")({
  component: TasksPage,
});

function TasksPage() {
  const { role } = useDemoIdentity();
  const [tenantFilter, setTenantFilter] = useState<string | "all">("all");

  const { data: tenants } = useQuery({
    queryKey: ["tenants-filter"],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("id, name").order("name");
      return data ?? [];
    },
  });

  if (role === "tenant") {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Раздел задач доступен только арендодателю и менеджеру.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold">Задачи</h1>
        <Select value={tenantFilter} onValueChange={(v) => setTenantFilter(v)}>
          <SelectTrigger className="w-56 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все арендаторы</SelectItem>
            {(tenants ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <SuggestionsPanel tenantFilter={tenantFilter} />
      <KanbanBoard tenantFilter={tenantFilter} />
    </div>
  );
}
