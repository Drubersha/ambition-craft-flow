import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";

const Input = z.object({
  kind: z.enum(["demo", "demo2", "moderator", "developer"]),
  login: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

function envFor(kind: z.infer<typeof Input>["kind"]) {
  const upper = kind.toUpperCase();
  const login = process.env[`DEMO_GATE_${upper}_LOGIN`] ?? process.env.DEMO_GATE_LOGIN ?? "admin";
  const password =
    process.env[`DEMO_GATE_${upper}_PASSWORD`] ?? process.env.DEMO_GATE_PASSWORD ?? "admin";
  return { login, password };
}

function eq(a: string, b: string) {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

export const verifyDemoGate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const expected = envFor(data.kind);
    const ok = eq(data.login, expected.login) && eq(data.password, expected.password);
    return { ok };
  });
