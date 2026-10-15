import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Экран «Импорт из 1С»: токены приёмника и журнал пакетов владельца.
 * Всё через service-клиент с явным фильтром по владельцу из сессии.
 */

/** JSON без unknown: серверные функции TanStack требуют сериализуемых типов. */
type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

export type ImportTokenRow = {
  id: string;
  label: string;
  allowed_ips: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type ImportBatchRow = {
  id: string;
  received_at: string;
  dry_run: boolean;
  mode: string;
  period_from: string | null;
  period_to: string | null;
  status: string;
  report: JsonObject | null;
  error: string | null;
  duration_ms: number | null;
  file_size: number | null;
  source: JsonObject | null;
};

export const listImportTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { adminRaw } = await import("@/lib/import-1c.server");
    const { data, error } = await adminRaw()
      .from("import_tokens")
      .select("id, label, allowed_ips, created_at, last_used_at, revoked_at")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ImportTokenRow[];
  });

const CreateTokenInput = z.object({
  label: z.string().trim().min(1).max(80),
  allowedIps: z.array(z.string().trim().min(3).max(45)).max(10).default([]),
});

/** Создаёт токен и возвращает его открытым текстом один раз; в базе — только хэш. */
export const createImportToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateTokenInput.parse(d))
  .handler(async ({ data, context }) => {
    const { adminRaw, generateToken, hashToken } = await import("@/lib/import-1c.server");
    const token = generateToken();
    const { data: row, error } = await adminRaw()
      .from("import_tokens")
      .insert({
        owner_id: context.userId,
        label: data.label,
        token_hash: hashToken(token),
        allowed_ips: data.allowedIps,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: String(row.id), token };
  });

export const revokeImportToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { adminRaw } = await import("@/lib/import-1c.server");
    const { error } = await adminRaw()
      .from("import_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listImportBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { adminRaw } = await import("@/lib/import-1c.server");
    const { data, error } = await adminRaw()
      .from("import_batches")
      .select(
        "id, received_at, dry_run, mode, period_from, period_to, status, report, error, duration_ms, file_size, source",
      )
      .eq("owner_id", context.userId)
      .order("received_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return (data ?? []) as ImportBatchRow[];
  });

export const listImportHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { adminRaw } = await import("@/lib/import-1c.server");
    const { data: rows, error } = await adminRaw()
      .from("import_history")
      .select("id, table_name, record_id, external_id, action, before, after, created_at")
      .eq("owner_id", context.userId)
      .eq("batch_id", data.batchId)
      .order("id")
      .limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []) as {
      id: number;
      table_name: string;
      record_id: string | null;
      external_id: string | null;
      action: string;
      before: JsonObject | null;
      after: JsonObject | null;
      created_at: string;
    }[];
  });
