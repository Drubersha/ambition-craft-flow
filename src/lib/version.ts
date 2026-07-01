// App version + release channel shown in the footer.
// `__APP_VERSION__` is injected from package.json at build time (see vite.config.ts),
// so package.json (SemVer) stays the single source of truth. See VERSIONING.md.
declare const __APP_VERSION__: string;

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

/** Release channel prefix shown before the version (e.g. BETA v0.1.0). */
export const APP_CHANNEL = "BETA";

/** Full label for the footer, e.g. "BETA v0.1.0". */
export const APP_VERSION_LABEL = `${APP_CHANNEL} v${APP_VERSION}`;
