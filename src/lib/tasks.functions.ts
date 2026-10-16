import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allowedOwnerIds } from "@/lib/auth-roles.server";

const AnalyzeInput = z.object({ messageId: z.string().uuid() });
const AcceptInput = z.object({ id: z.string().uuid() });
const DismissInput = z.object({ id: z.string().uuid() });
const UpdateStatusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["accepted", "in_progress", "review", "done", "archived"]),
  position: z.number().int().optional(),
});
const TaskIdInput = z.object({ id: z.string().uuid() });

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

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
