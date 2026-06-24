import { useEffect, useMemo } from "react";
import { Bell, Building2, Users, FileText, Wallet, TrendingUp, MessageSquare, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { listMyNotifications, markNotificationsRead, deleteNotifications } from "@/lib/notifications.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<string, any> = {
  property: Building2,
  tenant: Users,
  contract: FileText,
  charge: Wallet,
  indexation: TrendingUp,
  chat: MessageSquare,
  alert: AlertTriangle,
  account: ShieldCheck,
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}

export function NotificationsBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationsRead);
  const del = useServerFn(deleteNotifications);
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => list(),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  const items = data ?? [];
  const unread = useMemo(() => items.filter((n: any) => !n.read_at).length, [items]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid || cancelled) return;
      channel = supabase
        .channel(`notif:${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
          (payload: any) => {
            qc.invalidateQueries({ queryKey: ["notifications"] });
            const n = payload.new;
            toast(n?.title ?? "Уведомление", { description: n?.body ?? undefined });
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
          () => qc.invalidateQueries({ queryKey: ["notifications"] }),
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
          () => qc.invalidateQueries({ queryKey: ["notifications"] }),
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc]);

  async function openItem(n: any) {
    if (!n.read_at) {
      await markRead({ data: { ids: [n.id] } });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (n.route) navigate({ to: n.route });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Уведомления" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="text-sm font-medium">Уведомления</div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={unread === 0}
              onClick={async () => {
                await markRead({ data: { all: true } });
                qc.invalidateQueries({ queryKey: ["notifications"] });
              }}
            >
              Прочитать всё
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={items.length === 0}
              onClick={async () => {
                await del({ data: { all: true } });
                qc.invalidateQueries({ queryKey: ["notifications"] });
              }}
            >
              Очистить
            </Button>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">Пока нет уведомлений</div>
          ) : (
            items.map((n: any) => {
              const Icon = KIND_ICON[n.kind] ?? Bell;
              return (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={cn(
                    "w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 transition-colors flex gap-2",
                    !n.read_at && "bg-primary/5",
                  )}
                >
                  <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-sm font-medium truncate">{n.title}</div>
                      <div className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</div>
                    </div>
                    {n.body && <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>}
                  </div>
                  {!n.read_at && <span className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}