import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Send, FileText, Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { analyzeMessage, createManualTaskFromMessage } from "@/lib/tasks.functions";
import { ensureChatThreadFn } from "@/lib/chat.functions";
import { uploadSizeIssue } from "@/lib/upload-limits";
import { useSignedUrl } from "@/lib/use-signed-url";

type Props = {
  threadId: string;
  myRole: "owner" | "manager" | "tenant";
  myLabel: string;
};

type Message = {
  id: string;
  thread_id: string;
  body: string | null;
  sender_role: "owner" | "manager" | "tenant";
  sender_label: string | null;
  created_at: string;
};

type Attachment = {
  id: string;
  message_id: string;
  storage_path: string;
  file_name: string;
  mime: string | null;
};

function timeLabel(iso: string) {
  const d = new Date(iso);
  return `${formatDate(iso)} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function ChatThread({ threadId, myRole, myLabel }: Props) {
  const qc = useQueryClient();
  const analyze = useServerFn(analyzeMessage);
  const manualTask = useServerFn(createManualTaskFromMessage);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const { data: thread } = useQuery({
    queryKey: ["chat-thread", threadId],
    enabled: !!threadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_threads")
        .select("id, owner_id, tenant_id")
        .eq("id", threadId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["chat-messages", threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, thread_id, body, sender_role, sender_label, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
    enabled: !!threadId,
  });

  const { data: attachments } = useQuery({
    queryKey: ["chat-attachments", threadId],
    queryFn: async () => {
      if (!messages || messages.length === 0) return [] as Attachment[];
      const ids = messages.map((m) => m.id);
      const { data, error } = await supabase
        .from("chat_attachments")
        .select("id, message_id, storage_path, file_name, mime")
        .in("message_id", ids);
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
    enabled: !!messages && messages.length > 0,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`chat-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["chat-messages", threadId] });
          qc.invalidateQueries({ queryKey: ["chat-threads"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages?.length]);

  // Reset unread counters on open
  useEffect(() => {
    if (!threadId) return;
    const patch = myRole === "tenant" ? { unread_tenant: 0 } : { unread_owner: 0 };
    supabase
      .from("chat_threads")
      .update(patch)
      .eq("id", threadId)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["chat-threads"] });
      });
  }, [threadId, myRole, qc, messages?.length]);

  async function send() {
    const body = text.trim();
    if (!body && !pendingFile) return;
    if (!thread?.owner_id) {
      toast.error("Чат ещё загружается");
      return;
    }
    setSending(true);
    try {
      const ownerId = thread.owner_id;
      const { data: msg, error } = await supabase
        .from("chat_messages")
        .insert({
          thread_id: threadId,
          owner_id: ownerId,
          sender_role: myRole,
          sender_label: myLabel,
          body: body || null,
        })
        .select()
        .single();
      if (error) throw error;

      if (pendingFile) {
        // Re-check at send time: the File object may have been picked before
        // the limit check existed in this tab (stale bundle) or altered on disk.
        const issue = uploadSizeIssue(pendingFile);
        if (issue) throw new Error(issue);
        const path = `${ownerId}/${threadId}/${msg.id}/${pendingFile.name}`;
        const { error: upErr } = await supabase.storage
          .from("chat-attachments")
          .upload(path, pendingFile, { contentType: pendingFile.type || undefined });
        if (upErr) throw upErr;
        const { error: aErr } = await supabase.from("chat_attachments").insert({
          message_id: msg.id,
          owner_id: ownerId,
          storage_path: path,
          file_name: pendingFile.name,
          mime: pendingFile.type || null,
          size_bytes: pendingFile.size,
        });
        if (aErr) throw aErr;
      }

      setText("");
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["chat-messages", threadId] });
      qc.invalidateQueries({ queryKey: ["chat-attachments", threadId] });
      qc.invalidateQueries({ queryKey: ["chat-threads"] });

      // ИИ-анализ сообщений отключён (функция в разработке) — автоматический
      // вызов analyze убран; серверный выключатель в tasks.functions.ts.
    } catch (e: any) {
      toast.error(e.message ?? "Не удалось отправить");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-[60vh]">
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/50 border-b">
        <Sparkles className="h-3 w-3" />
        ИИ-анализ сообщений — функция ещё в разработке
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 p-3">
        {(messages ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Сообщений пока нет. Напишите первое.
          </p>
        )}
        {(messages ?? []).map((m) => {
          const mine =
            m.sender_role === myRole || (myRole !== "tenant" && m.sender_role !== "tenant");
          const atts = (attachments ?? []).filter((a) => a.message_id === m.id);
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className="flex flex-col items-stretch gap-1 max-w-[80%]">
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm shadow-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {m.sender_label && (
                    <div className={cn("text-[10px] mb-1 opacity-70")}>{m.sender_label}</div>
                  )}
                  {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                  {atts.map((a) => (
                    <AttachmentRow key={a.id} attachment={a} mine={mine} />
                  ))}
                  <div className={cn("text-[10px] mt-1 opacity-60")}>{timeLabel(m.created_at)}</div>
                </div>
                {myRole !== "tenant" && m.sender_role === "tenant" && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await manualTask({ data: { messageId: m.id } });
                        toast.success("Добавлено в предложения");
                        qc.invalidateQueries({ queryKey: ["task-suggestions"] });
                      } catch {
                        toast.error("Не удалось");
                      }
                    }}
                    className="self-start inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary px-1"
                  >
                    <Sparkles className="h-3 w-3" /> В задачи
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t p-2 space-y-2">
        {pendingFile && (
          <div className="flex items-center gap-2 text-xs bg-muted rounded px-2 py-1">
            <FileText className="h-3 w-3" />
            <span className="truncate flex-1">{pendingFile.name}</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                setPendingFile(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            >
              ×
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f) {
                const issue = uploadSizeIssue(f);
                if (issue) {
                  toast.error(issue);
                  e.target.value = "";
                  setPendingFile(null);
                  return;
                }
              }
              setPendingFile(f);
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            aria-label="Прикрепить файл"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Сообщение…"
            rows={2}
            className="flex-1 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button onClick={send} disabled={sending} size="icon" aria-label="Отправить">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function AttachmentRow({ attachment, mine }: { attachment: Attachment; mine: boolean }) {
  const url = useSignedUrl("chat-attachments", attachment.storage_path);

  const isImage = (attachment.mime ?? "").startsWith("image/");
  if (isImage && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block mt-2">
        <img src={url} alt={attachment.file_name} className="max-h-48 rounded" />
      </a>
    );
  }
  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "mt-2 flex items-center gap-2 text-xs rounded px-2 py-1 hover:underline",
        mine ? "bg-primary-foreground/10" : "bg-background/60",
      )}
    >
      <Download className="h-3 w-3" />
      <span className="truncate">{attachment.file_name}</span>
    </a>
  );
}

/** Ensures a chat thread exists for (owner, tenant) and returns its id. */
export async function ensureChatThread(tenantId: string): Promise<string> {
  const res = await ensureChatThreadFn({ data: { tenantId } });
  return res.threadId;
}
