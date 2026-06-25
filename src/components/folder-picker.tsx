import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFolders, buildTree, flatten, descendantIds } from "@/lib/folders";

const NONE = "__none__";
const ROOT = "__root__";

export function FolderPicker({
  value,
  onChange,
  includeAll,
  includeRoot,
  excludeDescendantsOf,
  placeholder = "Без папки",
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  /** Show an "All" option that maps to undefined-like state (use sentinel via callback). */
  includeAll?: boolean;
  /** Show a "Корень (без родителя)" option for hierarchy parent select. */
  includeRoot?: boolean;
  /** Hide folder + its descendants (for move/parent select). */
  excludeDescendantsOf?: string;
  placeholder?: string;
}) {
  const { data } = useFolders();
  const folders = data ?? [];
  const excluded = excludeDescendantsOf
    ? descendantIds(folders, excludeDescendantsOf)
    : new Set<string>();
  const list = flatten(buildTree(folders)).filter((n) => !excluded.has(n.id));

  const selectValue = value ?? (includeRoot ? ROOT : NONE);

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => {
        if (v === NONE || v === ROOT) onChange(null);
        else onChange(v);
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value={NONE}>Все папки</SelectItem>}
        {!includeAll && (
          <SelectItem value={includeRoot ? ROOT : NONE}>
            {includeRoot ? "— Корень —" : "Без папки"}
          </SelectItem>
        )}
        {list.map((n) => (
          <SelectItem key={n.id} value={n.id}>
            {"\u00A0\u00A0".repeat(n.depth)}
            {n.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
