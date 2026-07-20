import { describe, expect, it } from "vitest";
import {
  getAdminRoles,
  getUserRoles,
  isAdministrator,
  requireAdministrator,
} from "./auth-roles.server";

function roleClient(roles: string[], error: { message: string } | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: roles.map((role) => ({ role })), error }),
      }),
    }),
  };
}

describe("auth role helpers", () => {
  it("reads all roles and extracts administrator roles", async () => {
    const supabase = roleClient(["owner", "moderator", "developer", "tenant"]);

    await expect(getUserRoles(supabase, "user-1")).resolves.toEqual([
      "owner",
      "moderator",
      "developer",
      "tenant",
    ]);
    await expect(getAdminRoles(supabase, "user-1")).resolves.toEqual(["moderator", "developer"]);
  });

  it("recognizes moderator and developer access only", () => {
    expect(isAdministrator(["owner", "manager"])).toBe(false);
    expect(isAdministrator(["moderator"])).toBe(true);
    expect(isAdministrator(["developer"])).toBe(true);
  });

  it("rejects non-administrators and propagates role query errors", async () => {
    expect(() => requireAdministrator(["owner"])).toThrow("Forbidden");
    expect(() => requireAdministrator(["moderator"])).not.toThrow();
    await expect(
      getUserRoles(roleClient([], { message: "database unavailable" }), "user-1"),
    ).rejects.toThrow("database unavailable");
  });
});
