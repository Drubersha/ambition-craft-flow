import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Loader2 } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { PlanViewer } from "@/components/plan-viewer";
import { PLAN_ACCEPT, PLAN_BUCKET, removePlanFile, uploadPlanFile } from "@/lib/plan-file";
import { useSignedUrl } from "@/lib/use-signed-url";

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
  const url = useSignedUrl(PLAN_BUCKET, currentPath, 60 * 60);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const next = await uploadPlanFile({ file, pathPrefix, currentPath });
      await onChange(next);
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
      await removePlanFile(currentPath);
      await onChange({ path: null, mime: null });
      toast.success("План удалён");
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка удаления");
    } finally {
      setBusy(false);
    }
  };

  const isLegacyPdf = currentMime === "application/pdf";

  return (
    <div className="space-y-3 rounded-md border p-3">
      {currentPath && url ? (
        <div className="space-y-2">
          {isLegacyPdf ? (
            <div className="space-y-2">
              <div className="rounded border bg-muted p-4 text-sm text-muted-foreground">
                Старый файл в формате PDF. Загрузите его заново — он будет конвертирован в
                универсальный формат с зумом.
              </div>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Открыть текущий PDF
              </a>
            </div>
          ) : (
            <PlanViewer src={url} />
          )}
          <div className="flex gap-2 flex-wrap">
            <label>
              <input
                type="file"
                accept={PLAN_ACCEPT}
                className="hidden"
                disabled={disabled || busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" disabled={disabled || busy} asChild>
                <span>
                  <Upload className="h-4 w-4 mr-1" /> Заменить
                </span>
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
          <input
            type="file"
            accept={PLAN_ACCEPT}
            className="hidden"
            disabled={disabled || busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileText className="h-8 w-8" />}
          <div>{busy ? "Обработка..." : "Загрузить план (PNG, JPG, WEBP, PDF)"}</div>
        </label>
      )}
      {/* hidden input for click-anywhere not implemented; using label-based picker above */}
      <Input type="hidden" />
    </div>
  );
}
