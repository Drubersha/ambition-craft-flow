/**
 * Фильтр списка по папке: состояние (вкл/выкл + выбранная папка), правило
 * соответствия и общий UI-блок. Пункт «без папки» кодируется folderId === null
 * при включённом фильтре.
 *
 * У списков разная семантика вложенности — договоры фильтруются с учётом
 * вложенных папок, объекты по точному совпадению — поэтому она задаётся
 * флагом includeDescendants, а не зашита внутрь.
 *
 * В селекте три состояния с разными подписями: «Все папки» (фильтр выключен),
 * «— Без папки —» (только записи без папки) и конкретная папка. Раньше выключенный
 * фильтр показывал «Без папки», как и реальный пункт, — их было не отличить.
 */
import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFolders, buildTree, flatten, descendantIds } from "@/lib/folders";
import { useState } from "react";

const ALL = "__all__";
const NONE = "__none__";

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
  const list = useMemo(() => flatten(buildTree(filter.folders)), [filter.folders]);
  const value = filter.enabled ? (filter.folderId ?? NONE) : ALL;
  return (
    <div className="w-full sm:max-w-xs">
      <Select
        value={value}
        onValueChange={(v) => {
          if (v === ALL) filter.reset();
          else if (v === NONE) filter.setFolder(null);
          else filter.setFolder(v);
        }}
      >
        <SelectTrigger aria-label={placeholder}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Все папки</SelectItem>
          <SelectItem value={NONE}>— Без папки —</SelectItem>
          {list.map((n) => (
            <SelectItem key={n.id} value={n.id}>
              {"  ".repeat(n.depth)}
              {n.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
