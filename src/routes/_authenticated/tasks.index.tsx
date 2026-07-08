import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
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
        <div className="flex items-center gap-2">
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
          <NewTaskDialog tenants={tenants ?? []} />
        </div>
      </div>

      <SuggestionsPanel tenantFilter={tenantFilter} />
      <KanbanBoard tenantFilter={tenantFilter} />
    </div>
  );
}

const PRIORITY_OPTIONS: { value: "low" | "normal" | "high"; label: string }[] = [
  { value: "low", label: "Низкий" },
  { value: "normal", label: "Обычный" },
  { value: "high", label: "Высокий" },
];

/** Create a task by hand (not from a chat message). Lands in «Принято». */
function NewTaskDialog({ tenants }: { tenants: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [tenantId, setTenantId] = useState<string>("none");

  const save = useMutation({
    mutationFn: async () => {
      const name = title.trim();
      if (!name) throw new Error("Введите название задачи");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Не авторизован");
      const { error } = await supabase.from("tasks").insert({
        owner_id: u.user.id,
        tenant_id: tenantId === "none" ? null : tenantId,
        title: name.slice(0, 200),
        description: description.trim() || null,
        priority,
        status: "accepted",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Задача создана");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setOpen(false);
      setTitle("");
      setDescription("");
      setPriority("normal");
      setTenantId("none");
    },
    onError: (e: any) => toast.error(e.message ?? "Не удалось создать задачу"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9">
          <Plus className="h-4 w-4 mr-1" />
          Новая задача
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новая задача</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!save.isPending) save.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="task-title">Название</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="task-desc">Описание</Label>
            <Textarea
              id="task-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Приоритет</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Арендатор</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без арендатора</SelectItem>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Создание…" : "Создать задачу"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
