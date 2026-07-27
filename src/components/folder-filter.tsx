/**
 * Фильтр списка по папке: состояние (вкл/выкл + выбранная папка), правило
 * соответствия и общий UI-блок «пикер + Сбросить». Пункт «без папки»
 * кодируется folderId === null при включённом фильтре.
 *
 * У списков разная семантика вложенности — договоры фильтруются с учётом
 * вложенных папок, объекты по точному совпадению — поэтому она задаётся
 * флагом includeDescendants, а не зашита внутрь.
 */
import { useMemo, useState } from "react";
import { FolderPicker } from "@/components/folder-picker";
import { useFolders, descendantIds } from "@/lib/folders";

export function useFolderFilter({ includeDescendants }: { includeDescendants: boolean }) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const { data: folders = [] } = useFolders();
  const allowed = useMemo(
    () =>
      enabled && folderId !== null && includeDescendants ? descendantIds(folders, folderId) : null,
    [enabled, folderId, includeDescendants, folders],
  );

  const matches = (itemFolderId: string | null | undefined): boolean => {
    if (!enabled) return true;
    const pf = itemFolderId ?? null;
    if (folderId === null) return pf === null;
    if (includeDescendants) return pf !== null && !!allowed && allowed.has(pf);
    return pf === folderId;
  };

  return {
    enabled,
    folderId,
    folders,
    setFolder: (id: string | null) => {
      setFolderId(id);
      setEnabled(true);
    },
    reset: () => {
      setEnabled(false);
      setFolderId(null);
    },
    matches,
  };
}

export function FolderFilterBar({
  filter,
  placeholder,
}: {
  filter: ReturnType<typeof useFolderFilter>;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="w-full sm:max-w-xs">
        <FolderPicker
          value={filter.enabled ? filter.folderId : null}
          onChange={filter.setFolder}
          placeholder={placeholder}
        />
      </div>
      {filter.enabled && (
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground underline"
          onClick={filter.reset}
        >
          Сбросить
        </button>
      )}
    </div>
  );
}
