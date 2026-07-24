/**
 * Server-only helpers for idempotent upserts of `user_roles` and `user_links`,
 * so the `onConflict` keys and payload shape live in one place.
 *
 * Import only from `.server.ts` / inside server-function handlers — never
 * from a route or component module-scope.
 *
 * Хелперы НЕ бросают: возвращают ошибку supabase (или null при успехе),
 * решение «падать или молчать» остаётся за вызывающим.
 */

/** Выдать роль пользователю (повторная выдача — no-op). */
export async function grantRole(
  supabaseAdmin: any,
  userId: string,
  role: string,
): Promise<{ message: string } | null> {
  const { error } = await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role } as never, { onConflict: "user_id,role" });
  return error ?? null;
}

/** Создать связь owner→member (повторное создание — no-op). */
export async function upsertUserLink(
  supabaseAdmin: any,
  link: {
    ownerUserId: string;
    memberUserId: string;
    role: "manager" | "tenant";
    createdBy: string;
  },
): Promise<{ message: string } | null> {
  const { error } = await supabaseAdmin.from("user_links").upsert(
    {
      owner_user_id: link.ownerUserId,
      member_user_id: link.memberUserId,
      role: link.role,
      created_by: link.createdBy,
    } as never,
    { onConflict: "owner_user_id,member_user_id,role" },
  );
  return error ?? null;
}
