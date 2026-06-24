import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MessageSquare, Search } from "lucide-react";
import { ChatThread, ensureChatThread } from "@/components/chat/chat-thread";
import { useDemoIdentity, ROLE_LABELS } from "@/lib/demo-identity";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chats/")({
  component: ChatsPage,
});

function ChatsPage() {
  const { role } = useDemoIdentity();
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const { data: tenants } = useQuery({
    queryKey: ["chat-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, phone")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: threads } = useQuery({
    queryKey: ["chat-threads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_threads")
        .select("id, tenant_id, last_message_at, last_message_preview, unread_owner");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (role === "tenant") {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Этот раздел доступен только арендодателю и менеджеру. Откройте «Чат» в кабинете арендатора.
      </Card>
    );
  }

  const threadByTenant = new Map((threads ?? []).map((t) => [t.tenant_id, t]));
  const list = (tenants ?? [])
    .filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()))
    .map((t) => ({ tenant: t, thread: threadByTenant.get(t.id) }))
    .sort((a, b) => {
      const at = a.thread?.last_message_at ?? "";
      const bt = b.thread?.last_message_at ?? "";
      return bt.localeCompare(at);
    });

  async function openTenant(tenantId: string) {
    const tid = await ensureChatThread(tenantId);
    setSelected(tid);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">Чаты</h1>
      <div className="grid md:grid-cols-[320px_1fr] gap-4 min-h-[70vh]">
        <Card className="p-0 overflow-hidden flex flex-col">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Поиск по арендаторам"
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {list.length === 0 && (
              <p className="text-sm text-muted-foreground p-4 text-center">Арендаторов нет.</p>
            )}
            {list.map(({ tenant, thread }) => (
              <button
                key={tenant.id}
                onClick={() => openTenant(tenant.id)}
                className={cn(
                  "w-full text-left px-3 py-3 border-b hover:bg-muted/50 flex items-start gap-3",
                  selected && selected === thread?.id && "bg-muted",
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{tenant.name}</span>
                    {thread?.unread_owner ? (
                      <Badge variant="default" className="h-5 text-[10px]">{thread.unread_owner}</Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {thread?.last_message_preview ?? "Нет сообщений"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-0 overflow-hidden">
          {selected ? (
            <ChatThread
              threadId={selected}
              myRole={role === "manager" ? "manager" : "owner"}
              myLabel={ROLE_LABELS[role]}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-sm text-muted-foreground">
              <MessageSquare className="h-10 w-10 mb-2 opacity-50" />
              Выберите арендатора, чтобы открыть переписку.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}