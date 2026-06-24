import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ChatThread, ensureChatThread } from "@/components/chat/chat-thread";
import { useTenantContext } from "@/lib/tenant-context";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/me/chat")({
  component: MyChat,
});

function MyChat() {
  const ctx = useTenantContext();
  const tenantId = ctx.status === "ready" ? ctx.tenantId : null;
  const [threadId, setThreadId] = useState<string | null>(null);

  const { data: tenant } = useQuery({
    queryKey: ["me-tenant-name", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("name").eq("id", tenantId!).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!tenantId) return;
    ensureChatThread(tenantId)
      .then(setThreadId)
      .catch((e) => {
        console.error("ensureChatThread failed", e);
        toast.error(`Чат: ${e?.message ?? "ошибка"}`);
        setThreadId(null);
      });
  }, [tenantId]);

  return (
    <div className="space-y-3">
      <h1 className="text-xl sm:text-2xl font-bold">Чат с управляющим</h1>
      <Card className="p-0 overflow-hidden">
        {threadId ? (
          <ChatThread threadId={threadId} myRole="tenant" myLabel={tenant?.name ?? "Арендатор"} />
        ) : (
          <div className="p-6 text-center text-sm text-muted-foreground">Подготовка чата…</div>
        )}
      </Card>
    </div>
  );
}