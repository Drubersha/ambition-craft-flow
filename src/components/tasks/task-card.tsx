import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GripVertical, Trash2 } from "lucide-react";
import { AttachmentThumb } from "@/components/tasks/attachment-thumb";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "accepted" | "in_progress" | "review" | "done" | "archived";
  priority: "low" | "normal" | "high";
  photo_paths: string[];
  tenant_id: string | null;
  position: number;
};

function Thumb({ path }: { path: string }) {
  return <AttachmentThumb path={path} className="h-20 w-full" alt="Вложение задачи" />;
}

export function TaskCard({
  task,
  tenantName,
  onDelete,
}: {
  task: Task;
  tenantName?: string;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task", status: task.status },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-background border rounded-md p-2 shadow-sm space-y-2"
    >
      <div className="flex items-start gap-1">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground mt-0.5"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm leading-snug">{task.title}</div>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{task.description}</p>
          )}
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {task.photo_paths.length > 0 && <Thumb path={task.photo_paths[0]} />}
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <Badge
          variant={task.priority === "high" ? "destructive" : "secondary"}
          className="text-[10px]"
        >
          {task.priority === "high" ? "высокий" : task.priority === "low" ? "низкий" : "обычный"}
        </Badge>
        {tenantName && (
          <span className="text-[10px] text-muted-foreground truncate">{tenantName}</span>
        )}
      </div>
    </div>
  );
}
