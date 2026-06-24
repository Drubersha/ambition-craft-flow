/**
 * Resolve the public-facing site origin for SEO artefacts (sitemap, canonical).
 *
 * Priority:
 *  1. Explicit env override: `SITE_URL` / `VITE_SITE_URL` / `PUBLIC_SITE_URL`.
 *  2. Incoming request's Host header (server context only).
 *  3. Empty string — callers should emit relative URLs.
 *
 * Safe to import from both server functions/routes and client code.
 */

function fromEnv(): string | null {
  const fromProcess =
    (typeof process !== "undefined" && process.env
      ? process.env.SITE_URL || process.env.VITE_SITE_URL || process.env.PUBLIC_SITE_URL
      : undefined) || undefined;
  if (fromProcess) return stripTrailingSlash(fromProcess);
  const fromVite =
    typeof import.meta !== "undefined" && (import.meta as any).env
      ? (import.meta as any).env.VITE_SITE_URL || (import.meta as any).env.PUBLIC_SITE_URL
      : undefined;
  if (fromVite) return stripTrailingSlash(fromVite);
  return null;
}

function stripTrailingSlash(u: string) {
  return u.replace(/\/+$/, "");
}

/**
 * Server-side resolution. Pass the incoming Request when available so the
 * Host header can be used as a fallback (Cloudflare/Cloud always provides it).
 */
export function resolveSiteUrl(request?: Request | null): string {
  const env = fromEnv();
  if (env) return env;
  if (request) {
    const host = request.headers.get("host");
    if (host) {
      const proto =
        request.headers.get("x-forwarded-proto") ??
        (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  }
  return "";
}
