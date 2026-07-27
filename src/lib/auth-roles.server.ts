export type AdminRole = "developer" | "moderator";

export async function getUserRoles(supabase: any, userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => row.role as string);
}

export async function getAdminRoles(supabase: any, userId: string): Promise<AdminRole[]> {
  const roles = await getUserRoles(supabase, userId);
  return roles.filter((role): role is AdminRole => role === "developer" || role === "moderator");
}

export function isAdministrator(roles: readonly string[]): boolean {
  return roles.includes("moderator") || roles.includes("developer");
}

export function requireAdministrator(roles: readonly string[]): void {
  if (!isAdministrator(roles)) throw new Error("Forbidden");
}

/** Пролог админ-хендлера: получить роли и потребовать администратора. */
export async function requireAdminRoles(supabase: any, userId: string): Promise<AdminRole[]> {
  const roles = await getAdminRoles(supabase, userId);
  requireAdministrator(roles);
  return roles;
}

/** Owner ids, к данным которых у пользователя есть доступ: он сам + владельцы, которыми он управляет как менеджер. */
export async function allowedOwnerIds(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("user_links")
    .select("owner_user_id")
    .eq("member_user_id", userId)
    .eq("role", "manager");
  const ids = new Set<string>([userId]);
  (data ?? []).forEach((r: any) => ids.add(r.owner_user_id));
  return Array.from(ids);
}
