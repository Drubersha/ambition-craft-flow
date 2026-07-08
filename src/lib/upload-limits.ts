/** Single source of truth for the client-side upload cap (mirrored by the
 * storage service's FILE_SIZE_LIMIT in docker-compose.yml). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "25 МБ";

/** Human-readable error for an oversized/empty file, or null when OK. */
export function uploadSizeIssue(file: { size: number }): string | null {
  if (file.size > MAX_UPLOAD_BYTES) return `Файл не должен превышать ${MAX_UPLOAD_LABEL}`;
  if (file.size === 0) return "Файл пустой";
  return null;
}
