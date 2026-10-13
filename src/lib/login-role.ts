/**
 * Какую роль активировать после входа. Роли берутся из user_roles, а не из
 * выбора на экране входа: раньше пользователь выбирал «Арендодатель/Арендатор»
 * каждый раз и при ошибке его разлогинивало. Сохранённое предпочтение
 * учитывается, только если такая роль у аккаунта действительно есть.
 */
export type LoginRole = "owner" | "tenant" | "manager";

export function pickRoleAfterLogin(roles: string[], stored: string | null): LoginRole {
  if (stored && (stored === "owner" || stored === "tenant" || stored === "manager")) {
    if (roles.includes(stored)) return stored;
  }
  if (roles.includes("owner")) return "owner";
  if (roles.includes("tenant")) return "tenant";
  if (roles.includes("manager")) return "manager";
  return "owner";
}
