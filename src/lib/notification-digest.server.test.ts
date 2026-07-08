import { describe, expect, it } from "vitest";
import {
  buildDigestEmail,
  groupByUser,
  chatIntervalMs,
  otherIntervalMs,
  type PendingNotification,
} from "./notification-digest.server";

function n(over: Partial<PendingNotification>): PendingNotification {
  return {
    id: "id",
    user_id: "u1",
    kind: "property",
    title: "Новый объект",
    body: null,
    route: null,
    created_at: "2026-07-08T00:00:00Z",
    ...over,
  };
}

describe("groupByUser", () => {
  it("groups notifications by recipient preserving order", () => {
    const items = [
      n({ id: "1", user_id: "a" }),
      n({ id: "2", user_id: "b" }),
      n({ id: "3", user_id: "a" }),
    ];
    const g = groupByUser(items);
    expect([...g.keys()]).toEqual(["a", "b"]);
    expect(g.get("a")!.map((x) => x.id)).toEqual(["1", "3"]);
  });
});

describe("buildDigestEmail", () => {
  it("single notification keeps its title as the subject", () => {
    const { subject, text } = buildDigestEmail([n({ title: "Новый объект", body: "Склад №1" })]);
    expect(subject).toBe("LeasePlease · Новый объект");
    expect(text).toContain("Новый объект — Склад №1");
  });

  it("multiple notifications produce a counted digest", () => {
    const { subject, text, html } = buildDigestEmail([
      n({ id: "1", title: "Новый объект" }),
      n({ id: "2", title: "Новый арендатор", body: "ООО Ромашка" }),
      n({ id: "3", title: "Новый договор" }),
    ]);
    expect(subject).toBe("LeasePlease · новые уведомления (3)");
    expect(text).toContain("У вас 3 новых уведомлений:");
    expect(text).toContain("Новый арендатор — ООО Ромашка");
    expect(html).toContain("Новые уведомления (3)");
  });

  it("escapes HTML in titles and bodies", () => {
    const { html } = buildDigestEmail([n({ title: "<script>", body: 'a & "b"' })]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &amp; &quot;b&quot;");
  });

  it("includes deep links only when SITE_URL is configured", () => {
    const prev = process.env.SITE_URL;
    process.env.SITE_URL = "https://app.example.com/";
    const withLink = buildDigestEmail([n({ route: "/properties/1" })]);
    expect(withLink.text).toContain("https://app.example.com/properties/1");
    process.env.SITE_URL = "";
    const noLink = buildDigestEmail([n({ route: "/properties/1" })]);
    expect(noLink.text).not.toContain("/properties/1");
    process.env.SITE_URL = prev;
  });
});

describe("digest intervals", () => {
  it("defaults to 30 minutes for chat and 2 hours for the rest", () => {
    delete process.env.NOTIFY_DIGEST_CHAT_MS;
    delete process.env.NOTIFY_DIGEST_OTHER_MS;
    expect(chatIntervalMs()).toBe(30 * 60_000);
    expect(otherIntervalMs()).toBe(2 * 60 * 60_000);
  });

  it("is overridable via env with a sane lower bound", () => {
    process.env.NOTIFY_DIGEST_CHAT_MS = "20000";
    expect(chatIntervalMs()).toBe(20000);
    process.env.NOTIFY_DIGEST_CHAT_MS = "1"; // below 5s floor -> fallback
    expect(chatIntervalMs()).toBe(30 * 60_000);
    delete process.env.NOTIFY_DIGEST_CHAT_MS;
  });
});
