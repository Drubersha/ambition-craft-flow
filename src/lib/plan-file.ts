/**
 * Общая логика файлов планов (карт): валидация, нормализация в PNG,
 * загрузка в storage с удалением прежнего файла. Используется и виджетом
 * PlanUploader, и панелью файлов плана в разделе папок — правила и bucket
 * живут в одном месте.
 */
import { supabase } from "@/integrations/supabase/client";
import { normalizeToPng } from "./plan-normalize";
import { uploadSizeIssue } from "./upload-limits";

export const PLAN_BUCKET = "documents";
export const PLAN_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const PLAN_ALLOWED = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

/**
 * Валидирует файл, конвертирует в PNG и загружает, удаляя прежний план.
 * Возвращает новые path/mime для записи в папку/объект; бросает Error
 * с русским сообщением для показа пользователю.
 */
export async function uploadPlanFile(opts: {
  file: File;
  pathPrefix: string;
  currentPath: string | null;
}): Promise<{ path: string; mime: string }> {
  if (!PLAN_ALLOWED.includes(opts.file.type)) {
    throw new Error("Допустимы PNG, JPG, WEBP или PDF");
  }
  const sizeIssue = uploadSizeIssue(opts.file);
  if (sizeIssue) throw new Error(sizeIssue);
  const { blob, filename } = await normalizeToPng(opts.file);
  if (opts.currentPath) {
    // Ошибка удаления старого файла не блокирует загрузку нового.
    await supabase.storage.from(PLAN_BUCKET).remove([opts.currentPath]);
  }
  const safeName = filename.replace(/[^\w.-]+/g, "_");
  const path = `${opts.pathPrefix}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from(PLAN_BUCKET).upload(path, blob, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw error;
  return { path, mime: "image/png" };
}

/** Удаляет файл плана из хранилища (ошибку не бросает — как и раньше). */
export async function removePlanFile(path: string): Promise<void> {
  await supabase.storage.from(PLAN_BUCKET).remove([path]);
}
