import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, FileText, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";

const BUCKET = "documents";
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

export function PlanUploader({
  pathPrefix,
  currentPath,
  currentMime,
  onChange,
  disabled,
}: {
  /** Directory prefix in bucket, e.g. "folder-plans/<id>" or "property-plans/<id>". */
  pathPrefix: string;
  currentPath: string | null;
  currentMime: string | null;
  onChange: (next: { path: string | null; mime: string | null }) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    if (!currentPath) { setUrl(null); return; }
    (async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(currentPath, 60 * 60);
      if (!cancel && !error) setUrl(data.signedUrl);
    })();
    return () => { cancel = true; };
  }, [currentPath]);

  const handleFile = async (file: File) => {
    if (!ALLOWED.includes(file.type)) {
      toast.error("Допустимы PNG, JPG, WEBP или PDF");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Файл не должен превышать 25 МБ");
      return;
    }
    setBusy(true);
    try {
      // Delete the old file if present
      if (currentPath) {
        await supabase.storage.from(BUCKET).remove([currentPath]);
      }
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${pathPrefix}/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: true,
      });
      if (error) throw error;
      await onChange({ path, mime: file.type });
      toast.success("План загружен");
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!currentPath) return;
    setBusy(true);
    try {
      await supabase.storage.from(BUCKET).remove([currentPath]);
      await onChange({ path: null, mime: null });
      toast.success("План удалён");
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка удаления");
    } finally {
      setBusy(false);
    }
  };

  const isPdf = currentMime === "application/pdf";

  return (
    <div className="space-y-3 rounded-md border p-3">
      {currentPath && url ? (
        <div className="space-y-2">
          {isPdf ? (
            <div className="space-y-2">
              <iframe src={url} title="План" className="w-full h-[480px] rounded border bg-muted" />
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Открыть PDF в новой вкладке
              </a>
            </div>
          ) : (
            <a href={url} target="_blank" rel="noreferrer" className="block">
              <img src={url} alt="План" className="max-h-[480px] w-full rounded border bg-muted object-contain" />
            </a>
          )}
          <div className="flex gap-2 flex-wrap">
            <label>
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden"
                disabled={disabled || busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
              <Button type="button" variant="outline" size="sm" disabled={disabled || busy} asChild>
                <span><Upload className="h-4 w-4 mr-1" /> Заменить</span>
              </Button>
            </label>
            <ConfirmButton
              variant="outline"
              size="sm"
              destructive
              title="Удалить план?"
              description="Файл будет удалён из хранилища."
              confirmText="Удалить"
              onConfirm={handleDelete}
              disabled={disabled || busy}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Удалить
            </ConfirmButton>
          </div>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 py-8 cursor-pointer text-sm text-muted-foreground hover:bg-muted/50 rounded">
          <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden"
            disabled={disabled || busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileText className="h-8 w-8" />}
          <div>{busy ? "Загрузка..." : "Загрузить план (PNG, JPG, WEBP, PDF)"}</div>
        </label>
      )}
      {/* hidden input for click-anywhere not implemented; using label-based picker above */}
      <Input type="hidden" />
    </div>
  );
}