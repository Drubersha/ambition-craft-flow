import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

/**
 * Приёмник ежедневного файла из 1С. Спецификация формата — docs/1c/.
 *   POST /api/1c/import            — принять и записать
 *   POST /api/1c/import?dry_run=1  — только проверить и вернуть отчёт
 * Авторизация: Authorization: Bearer <токен из раздела «Импорт из 1С»>.
 * Тело: JSON (UTF-8), допускается Content-Encoding: gzip. Лимит 50 МБ.
 */

const MAX_BYTES = 50 * 1024 * 1024;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 1), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function clientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

export const Route = createFileRoute("/api/1c/import")({
  server: {
    handlers: {
      GET: async () =>
        json(405, {
          ok: false,
          reason: "method",
          hint: "Отправьте файл методом POST с заголовком Authorization: Bearer <токен>. Описание формата: docs/1c в репозитории.",
        }),
      POST: async ({ request }) => {
        const { adminRaw, authenticateToken, ipAllowed, runImport } =
          await import("@/lib/import-1c.server");
        const sb = adminRaw();

        const token = await authenticateToken(sb, request.headers.get("authorization"));
        if (!token) return json(401, { ok: false, reason: "unauthorized" });
        const ip = clientIp(request);
        if (!ipAllowed(token.allowedIps, ip))
          return json(403, { ok: false, reason: "ip_not_allowed", ip });

        const declared = Number(request.headers.get("content-length") || 0);
        if (declared > MAX_BYTES)
          return json(413, { ok: false, reason: "too_large", limit_bytes: MAX_BYTES });

        let bytes: Buffer;
        try {
          const buf = Buffer.from(await request.arrayBuffer());
          if (buf.length > MAX_BYTES)
            return json(413, { ok: false, reason: "too_large", limit_bytes: MAX_BYTES });
          const enc = (request.headers.get("content-encoding") || "").toLowerCase();
          bytes = enc.includes("gzip") ? gunzipSync(buf) : buf;
          if (bytes.length > MAX_BYTES)
            return json(413, { ok: false, reason: "too_large", limit_bytes: MAX_BYTES });
        } catch (e) {
          return json(400, {
            ok: false,
            reason: "body",
            error: e instanceof Error ? e.message : String(e),
          });
        }

        let raw: unknown;
        try {
          raw = JSON.parse(bytes.toString("utf8"));
        } catch (e) {
          return json(400, {
            ok: false,
            reason: "json",
            error: e instanceof Error ? e.message : String(e),
          });
        }

        const url = new URL(request.url);
        const dryRun = ["1", "true", "yes"].includes(
          (url.searchParams.get("dry_run") || "").toLowerCase(),
        );
        const fileHash = createHash("sha256").update(bytes).digest("hex");

        try {
          const result = await runImport({
            sb,
            ownerId: token.ownerId,
            tokenId: token.id,
            raw,
            fileSize: bytes.length,
            fileHash,
            dryRun,
          });
          return json(result.status, result.body);
        } catch (e) {
          console.error("[1c-import]", e);
          return json(500, {
            ok: false,
            reason: "internal",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      },
    },
  },
});
