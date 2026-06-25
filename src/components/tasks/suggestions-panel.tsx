import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, X, ImageIcon } from "lucide-react";
import { acceptSuggestion, dismissSuggestion } from "@/lib/tasks.functions";
import { toast } from "sonner";

type Suggestion = {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "normal" | "high";
  photo_paths: string[];
  tenant_id: string | null;
  thread_id: string | null;
  created_at: string;
};

function PhotoThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.storage
      .from("chat-attachments")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (active) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [path]);
  if (!url)
    return (
      <div className="h-14 w-14 rounded bg-muted flex items-center justify-center">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  return <img src={url} alt="Вложение из сообщения" className="h-14 w-14 rounded object-cover" />;
}

export function SuggestionsPanel({ tenantFilter }: { tenantFilter: string | "all" }) {
  const qc = useQueryClient();
  const accept = useServerFn(acceptSuggestion);
  const dismiss = useServerFn(dismissSuggestion);

  const { data: suggestions } = useQuery({
    queryKey: ["task-suggestions", tenantFilter],
    queryFn: async () => {
      let q = supabase
        .from("task_suggestions")
        .select("id, title, description, priority, photo_paths, tenant_id, thread_id, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (tenantFilter !== "all") q = q.eq("tenant_id", tenantFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Suggestion[];
    },
  });

  const { data: tenants } = useQuery({
    queryKey: ["tenants-map"],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("id, name");
      return new Map((data ?? []).map((t) => [t.id, t.name]));
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("task-suggestions-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "task_suggestions" }, () => {
        qc.invalidateQueries({ queryKey: ["task-suggestions"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <Card className="p-3 sm:p-4 border-primary/40 bg-primary/5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-sm">Предложения ИИ ({suggestions.length})</h2>
      </div>
      <div className="space-y-2">
        {suggestions.map((s) => (
          <div key={s.id} className="flex gap-3 items-start bg-background rounded-md p-2 border">
            {s.photo_paths[0] ? <PhotoThumb path={s.photo_paths[0]} /> : null}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{s.title}</span>
                <Badge
                  variant={s.priority === "high" ? "destructive" : "secondary"}
                  className="text-[10px]"
                >
                  {s.priority === "high" ? "высокий" : s.priority === "low" ? "низкий" : "обычный"}
                </Badge>
                {s.tenant_id && tenants?.get(s.tenant_id) && (
                  <span className="text-xs text-muted-foreground">{tenants.get(s.tenant_id)}</span>
                )}
              </div>
              {s.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await accept({ data: { id: s.id } });
                    toast.success("Добавлено в задачи");
                    qc.invalidateQueries({ queryKey: ["tasks"] });
                    qc.invalidateQueries({ queryKey: ["task-suggestions"] });
                  } catch (e) {
                    toast.error("Ошибка");
                  }
                }}
              >
                <Check className="h-3 w-3 mr-1" />
                Создать
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await dismiss({ data: { id: s.id } });
                  qc.invalidateQueries({ queryKey: ["task-suggestions"] });
                }}
              >
                <X className="h-3 w-3 mr-1" />
                Скрыть
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
