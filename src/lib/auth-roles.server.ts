export type AdminRole = "developer" | "moderator";

type RoleQueryClient = {
  from: (table: "user_roles") => {
    select: (columns: "role") => {
      eq: (
        column: "user_id",
        userId: string,
      ) => Promise<{ data: Array<{ role: string }> | null; error: { message: string } | null }>;
    };
  };
};

export async function getUserRoles(
  supabase: RoleQueryClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.role);
}

export async function getAdminRoles(
  supabase: RoleQueryClient,
  userId: string,
): Promise<AdminRole[]> {
  const roles = await getUserRoles(supabase, userId);
  return roles.filter((role): role is AdminRole => role === "developer" || role === "moderator");
}

export function isAdministrator(roles: readonly string[]): boolean {
  return roles.includes("moderator") || roles.includes("developer");
}

export function requireAdministrator(roles: readonly string[]): void {
  if (!isAdministrator(roles)) throw new Error("Forbidden");
}
