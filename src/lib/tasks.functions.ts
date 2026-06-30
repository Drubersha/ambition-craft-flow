import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ensureOwnerAccess } from "@/lib/manager-context.functions";

const AnalyzeInput = z.object({ messageId: z.string().uuid() });
const AcceptInput = z.object({ id: z.string().uuid() });
const DismissInput = z.object({ id: z.string().uuid() });
const UpdateStatusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["accepted", "in_progress", "review", "done", "archived"]),
  position: z.number().int().optional(),
});
const TaskIdInput = z.object({ id: z.string().uuid() });

const TaskSchema = z.object({
  is_task: z.boolean(),
  title: z.string().max(120).default(""),
  description: z.string().max(800).default(""),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Owner ids the caller can act on: themselves + every owner they manage. */
async function allowedOwnerIds(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("user_links")
    .select("owner_user_id")
    .eq("member_user_id", userId)
    .eq("role", "manager");
  const ids = new Set<string>([userId]);
  (data ?? []).forEach((r: any) => ids.add(r.owner_user_id));
  return Array.from(ids);
}

export const analyzeMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AnalyzeInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { data: msg, error } = await sb
      .from("chat_messages")
      .select("id, thread_id, body, sender_role, analyzed_at, owner_id")
      .eq("id", data.messageId)
      .maybeSingle();
    if (error || !msg) return { ok: false, reason: "not_found" };
    try {
      await ensureOwnerAccess(context.supabase, context.userId, msg.owner_id as string);
    } catch {
      return { ok: false, reason: "forbidden" };
    }
    if (msg.analyzed_at) return { ok: false, reason: "already" };
    if (msg.sender_role !== "tenant") {
      await sb
        .from("chat_messages")
        .update({ analyzed_at: new Date().toISOString() })
        .eq("id", msg.id);
      return { ok: false, reason: "not_tenant" };
    }

    const { data: thread } = await sb
      .from("chat_threads")
      .select("id, tenant_id, owner_id")
      .eq("id", msg.thread_id)
      .maybeSingle();

    const { data: atts } = await sb
      .from("chat_attachments")
      .select("storage_path, mime, file_name")
      .eq("message_id", msg.id);
    const photos = (atts ?? []).filter((a) => (a.mime ?? "").startsWith("image/"));

    // Fetch image bytes server-side so any provider (incl. local ollama, which
    // doesn't fetch remote URLs) can read them.
    const imageDatas: Uint8Array[] = [];
    for (const p of photos) {
      const { data: signed } = await sb.storage
        .from("chat-attachments")
        .createSignedUrl(p.storage_path, 600);
      if (!signed?.signedUrl) continue;
      try {
        const resp = await fetch(signed.signedUrl);
        if (resp.ok) imageDatas.push(new Uint8Array(await resp.arrayBuffer()));
      } catch (e) {
        console.error("[analyzeMessage] image fetch failed", e);
      }
    }

    // Recent context
    const { data: recent } = await sb
      .from("chat_messages")
      .select("sender_role, body, created_at")
      .eq("thread_id", msg.thread_id)
      .order("created_at", { ascending: false })
      .limit(6);
    const ctx = (recent ?? [])
      .reverse()
      .map((m) => `[${m.sender_role}] ${m.body ?? "(вложение)"}`)
      .join("\n");

    const { createAiProvider, getAiModelName } = await import("./ai-gateway.server");
    const gateway = createAiProvider();
    if (!gateway) return { ok: false, reason: "no_key" };

    const userContent: Array<{ type: "text"; text: string } | { type: "image"; image: Uint8Array }> = [
      {
        type: "text",
        text:
          "Ты помощник управляющего арендой. Проанализируй последнее сообщение арендатора и фото к нему. " +
          "Определи, описывает ли арендатор задачу/проблему/запрос, который нужно выполнить (поломка, заявка, просьба). " +
          "Если да — сформулируй короткий title (до 80 символов) и description, выбери priority: low/normal/high. " +
          "Если это просто общение/вопрос/благодарность — верни is_task=false.\n\n" +
          `Контекст переписки:\n${ctx}\n\nПоследнее сообщение: ${msg.body ?? "(только вложение)"}`,
      },
      ...imageDatas.map((d) => ({ type: "image" as const, image: d })),
    ];

    let parsed: z.infer<typeof TaskSchema>;
    try {
      const res = await generateText({
        model: gateway.chatModel(getAiModelName()),
        experimental_output: Output.object({ schema: TaskSchema }),
        messages: [{ role: "user", content: userContent as never }],
      });
      parsed = (res as { experimental_output: z.infer<typeof TaskSchema> }).experimental_output;
    } catch (e) {
      console.error("[analyzeMessage] AI error", e);
      return { ok: false, reason: "ai_error", error: String(e) };
    }

    await sb
      .from("chat_messages")
      .update({ analyzed_at: new Date().toISOString() })
      .eq("id", msg.id);

    if (!parsed.is_task || !parsed.title) return { ok: true, created: false };

    await sb.from("task_suggestions").insert({
      owner_id: msg.owner_id,
      tenant_id: thread?.tenant_id ?? null,
      thread_id: msg.thread_id,
      source_message_id: msg.id,
      title: parsed.title.slice(0, 120),
      description: parsed.description ?? null,
      priority: parsed.priority,
      photo_paths: photos.map((p) => p.storage_path),
      model: getAiModelName(),
    });
    return { ok: true, created: true };
  });

export const acceptSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AcceptInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const allowed = await allowedOwnerIds(context.supabase, context.userId);
    const { data: s, error } = await sb
      .from("task_suggestions")
      .select("*")
      .eq("id", data.id)
      .in("owner_id", allowed)
      .maybeSingle();
    if (error || !s) throw new Error("not found");
    const { data: maxRow } = await sb
      .from("tasks")
      .select("position")
      .eq("owner_id", s.owner_id)
      .eq("status", "accepted")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = (maxRow?.position ?? 0) + 1;
    const { data: created, error: insErr } = await sb
      .from("tasks")
      .insert({
        owner_id: s.owner_id,
        tenant_id: s.tenant_id,
        thread_id: s.thread_id,
        source_message_id: s.source_message_id,
        title: s.title,
        description: s.description,
        priority: s.priority,
        photo_paths: s.photo_paths,
        status: "accepted",
        position: nextPos,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    await sb.from("task_suggestions").update({ status: "accepted" }).eq("id", s.id);
    return { id: created.id };
  });

export const dismissSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DismissInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const allowed = await allowedOwnerIds(context.supabase, context.userId);
    await sb
      .from("task_suggestions")
      .update({ status: "dismissed" })
      .eq("id", data.id)
      .in("owner_id", allowed);
    return { ok: true };
  });

export const updateTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateStatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const allowed = await allowedOwnerIds(context.supabase, context.userId);
    const patch =
      typeof data.position === "number"
        ? { status: data.status, position: data.position }
        : { status: data.status };
    await sb.from("tasks").update(patch).eq("id", data.id).in("owner_id", allowed);
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TaskIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const allowed = await allowedOwnerIds(context.supabase, context.userId);
    await sb.from("tasks").delete().eq("id", data.id).in("owner_id", allowed);
    return { ok: true };
  });

export const createManualTaskFromMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AnalyzeInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = await admin();
    const { data: msg } = await sb
      .from("chat_messages")
      .select("id, thread_id, body, owner_id")
      .eq("id", data.messageId)
      .maybeSingle();
    if (!msg) throw new Error("not found");
    if (msg.owner_id !== context.userId) throw new Error("forbidden");
    const { data: thread } = await sb
      .from("chat_threads")
      .select("tenant_id")
      .eq("id", msg.thread_id)
      .maybeSingle();
    const { data: atts } = await sb
      .from("chat_attachments")
      .select("storage_path, mime")
      .eq("message_id", msg.id);
    const photos = (atts ?? [])
      .filter((a) => (a.mime ?? "").startsWith("image/"))
      .map((a) => a.storage_path);
    await sb.from("task_suggestions").insert({
      owner_id: msg.owner_id,
      tenant_id: thread?.tenant_id ?? null,
      thread_id: msg.thread_id,
      source_message_id: msg.id,
      title: (msg.body ?? "Новая задача").slice(0, 80),
      description: msg.body,
      priority: "normal",
      photo_paths: photos,
      model: "manual",
    });
    return { ok: true };
  });
