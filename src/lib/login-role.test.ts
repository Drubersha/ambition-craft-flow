import { describe, expect, it } from "vitest";
import { pickRoleAfterLogin } from "./login-role";

describe("pickRoleAfterLogin", () => {
  it("prefers the stored role when the account has it", () => {
    expect(pickRoleAfterLogin(["owner", "tenant"], "tenant")).toBe("tenant");
    expect(pickRoleAfterLogin(["owner", "tenant"], "owner")).toBe("owner");
  });
  it("ignores a stored role the account does not have", () => {
    expect(pickRoleAfterLogin(["owner"], "tenant")).toBe("owner");
    expect(pickRoleAfterLogin(["tenant"], "owner")).toBe("tenant");
  });
  it("falls back owner → tenant → manager → owner", () => {
    expect(pickRoleAfterLogin(["moderator", "owner"], null)).toBe("owner");
    expect(pickRoleAfterLogin(["tenant"], null)).toBe("tenant");
    expect(pickRoleAfterLogin(["manager"], null)).toBe("manager");
    expect(pickRoleAfterLogin([], "developer")).toBe("owner");
  });
});
