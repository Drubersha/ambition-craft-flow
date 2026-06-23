import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TaskCard, type Task } from "./task-card";
import { updateTaskStatus, deleteTask } from "@/lib/tasks.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const COLUMNS: { id: Task["status"]; label: string }[] = [
  { id: "accepted", label: "Принято" },
  { id: "in_progress", label: "В процессе" },
  { id: "review", label: "На проверке" },
  { id: "done", label: "Готово" },
];

function Column({
  id,
  label,
  tasks,
  tenantsMap,
  onDelete,
}: {
  id: Task["status"];
  label: string;
  tasks: Task[];
  tenantsMap: Map<string, string>;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: "column", status: id } });
  return (
    <Card className="p-2 flex flex-col min-h-[200px]">
      <div className="flex items-center justify-between px-1 pb-2 border-b mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn("flex-1 space-y-2 min-h-[120px] rounded p-1", isOver && "bg-primary/5 ring-1 ring-primary/30")}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              tenantName={t.tenant_id ? tenantsMap.get(t.tenant_id) : undefined}
              onDelete={() => onDelete(t.id)}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">Перетащите задачу сюда</p>
        )}
      </div>
    </Card>
  );
}

export function KanbanBoard({ tenantFilter }: { tenantFilter: string | "all" }) {
  const qc = useQueryClient();
  const updateStatus = useServerFn(updateTaskStatus);
  const del = useServerFn(deleteTask);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: tasks } = useQuery({
    queryKey: ["tasks", tenantFilter],
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select("id, title, description, status, priority, photo_paths, tenant_id, position")
        .order("position", { ascending: true });
      if (tenantFilter !== "all") q = q.eq("tenant_id", tenantFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const { data: tenantsMap } = useQuery({
    queryKey: ["tenants-map"],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("id, name");
      return new Map((data ?? []).map((t) => [t.id, t.name]));
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("tasks-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["tasks"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const grouped = useMemo(() => {
    const map = new Map<Task["status"], Task[]>();
    for (const s of ["accepted", "in_progress", "review", "done", "archived"] as Task["status"][]) {
      map.set(s, []);
    }
    (tasks ?? []).forEach((t) => map.get(t.status)!.push(t));
    return map;
  }, [tasks]);

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const taskId = String(active.id);
    const task = (tasks ?? []).find((t) => t.id === taskId);
    if (!task) return;
    const overData = over.data.current as { type?: string; status?: Task["status"] } | undefined;
    let newStatus: Task["status"] = task.status;
    if (overData?.type === "column" && overData.status) newStatus = overData.status;
    else if (overData?.type === "task" && overData.status) newStatus = overData.status;
    if (newStatus === task.status && over.id === active.id) return;
    // If dropped on done column, also archive? No — separate action.
    try {
      await updateStatus({ data: { id: taskId, status: newStatus } });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    } catch (err) {
      toast.error("Не удалось обновить статус");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить задачу?")) return;
    await del({ data: { id } });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  async function archiveDone() {
    const doneTasks = grouped.get("done") ?? [];
    if (doneTasks.length === 0) return;
    await Promise.all(
      doneTasks.map((t) => updateStatus({ data: { id: t.id, status: "archived" } })),
    );
    qc.invalidateQueries({ queryKey: ["tasks"] });
    toast.success(`В архив: ${doneTasks.length}`);
  }

  const activeTask = (tasks ?? []).find((t) => t.id === activeId);

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {COLUMNS.map((c) => (
          <Column
            key={c.id}
            id={c.id}
            label={c.label}
            tasks={grouped.get(c.id) ?? []}
            tenantsMap={tenantsMap ?? new Map()}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" onClick={() => setShowArchive((v) => !v)}>
            {showArchive ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
            Архив ({(grouped.get("archived") ?? []).length})
          </Button>
          {(grouped.get("done") ?? []).length > 0 && (
            <Button variant="outline" size="sm" onClick={archiveDone}>
              Готовые → в архив
            </Button>
          )}
        </div>
        {showArchive && (
          <Card className="p-2">
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {(grouped.get("archived") ?? []).map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  tenantName={t.tenant_id ? tenantsMap?.get(t.tenant_id) : undefined}
                  onDelete={() => handleDelete(t.id)}
                />
              ))}
              {(grouped.get("archived") ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground p-3">Архив пуст</p>
              )}
            </div>
          </Card>
        )}
      </div>

      <DragOverlay>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            tenantName={activeTask.tenant_id ? tenantsMap?.get(activeTask.tenant_id) : undefined}
            onDelete={() => {}}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}