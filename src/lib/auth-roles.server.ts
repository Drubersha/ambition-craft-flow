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
