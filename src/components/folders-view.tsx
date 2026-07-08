import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ChevronRight,
  ChevronDown,
  FolderPlus,
  Folder as FolderIcon,
  Plus,
  Pencil,
  Trash2,
  Building2,
  MapPin,
  Pentagon,
  X,
  Check,
  Upload,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/confirm-button";
import { FolderPicker } from "@/components/folder-picker";
import { PlanUploader } from "@/components/plan-uploader";
import { useFolders, buildTree, descendantIds, type FolderNode, type Folder } from "@/lib/folders";
import { PlanViewer } from "@/components/plan-viewer";
import { PlanMarkup, type EditState } from "@/components/plan-markup";
import {
  useFolderMarkings,
  useFolderPlanProperties,
  type Marking,
  type MarkingShape,
} from "@/lib/markings";
import { uploadSizeIssue } from "@/lib/upload-limits";
import { normalizeToPng } from "@/lib/plan-normalize";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export { FoldersPage as FoldersView };

const PLAN_BUCKET = "documents";
const PLAN_ALLOWED = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

function PlanFileControls({
  pathPrefix,
  currentPath,
  currentMime,
  signedUrl,
  onChange,
}: {
  pathPrefix: string;
  currentPath: string | null;
  currentMime: string | null;
  signedUrl: string | null;
  onChange: (next: { path: string | null; mime: string | null }) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    if (!PLAN_ALLOWED.includes(file.type)) {
      toast.error("Допустимы PNG, JPG, WEBP или PDF");
      return;
    }
    const sizeIssue = uploadSizeIssue(file);
    if (sizeIssue) {
      toast.error(sizeIssue);
      return;
    }
    setBusy(true);
    try {
      const { blob, filename } = await normalizeToPng(file);
      if (currentPath) {
        await supabase.storage.from(PLAN_BUCKET).remove([currentPath]);
      }
      const safeName = filename.replace(/[^\w.-]+/g, "_");
      const path = `${pathPrefix}/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage.from(PLAN_BUCKET).upload(path, blob, {
        contentType: "image/png",
        upsert: true,
      });
      if (error) throw error;
      await onChange({ path, mime: "image/png" });
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
      await supabase.storage.from(PLAN_BUCKET).remove([currentPath]);
      await onChange({ path: null, mime: null });
      toast.success("План удалён");
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка удаления");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={busy} asChild>
          <span>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            {currentPath ? "Заменить план" : "Загрузить план"}
          </span>
        </Button>
      </label>
      {currentPath && signedUrl && (
        <Button type="button" variant="outline" size="sm" asChild>
          <a href={signedUrl} target="_blank" rel="noreferrer" download>
            Скачать
          </a>
        </Button>
      )}
      {currentPath && (
        <ConfirmButton
          variant="outline"
          size="sm"
          destructive
          title="Удалить план?"
          description="Файл будет удалён из хранилища."
          confirmText="Удалить"
          onConfirm={handleDelete}
          disabled={busy}
        >
          <Trash2 className="h-4 w-4 mr-1" /> Удалить план
        </ConfirmButton>
      )}
      {currentMime === "application/pdf" && (
        <span className="text-xs text-muted-foreground">
          Старый PDF — загрузите заново, чтобы включить разметку.
        </span>
      )}
    </div>
  );
}

function FoldersPage() {
  const qc = useQueryClient();
  const { data: folders = [], isLoading } = useFolders();
  const tree = buildTree(folders);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const selected = folders.find((f) => f.id === selectedId) ?? null;

  const create = useMutation({
    mutationFn: async (v: { name: string; parent_id: string | null }) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("folders")
        .insert({
          owner_id: u.user!.id,
          name: v.name,
          parent_id: v.parent_id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      setSelectedId(d.id);
      if (d.parent_id) setExpanded((s) => new Set(s).add(d.parent_id!));
      toast.success("Папка создана");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (v: Partial<Folder> & { id: string }) => {
      const { error } = await supabase.from("folders").update(v).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folders"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      // Check that no children and no properties reference it
      const [{ count: childCount }, { count: propCount }] = await Promise.all([
        supabase.from("folders").select("id", { count: "exact", head: true }).eq("parent_id", id),
        supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("folder_id", id),
      ]);
      if ((childCount ?? 0) > 0) throw new Error("Сначала удалите вложенные папки");
      if ((propCount ?? 0) > 0) throw new Error("В папке есть объекты — перенесите их или удалите");
      const folder = folders.find((f) => f.id === id);
      if (folder?.plan_path) {
        await supabase.storage.from("documents").remove([folder.plan_path]);
      }
      const { error } = await supabase.from("folders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folders"] });
      setSelectedId(null);
      toast.success("Папка удалена");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Папки"
        description="Группируйте объекты и храните планы территории"
        action={
          <NewFolderButton
            onCreate={(name) => create.mutate({ name, parent_id: null })}
            label="Новая папка"
          />
        }
      />

      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        <Card className="p-2 max-h-[80vh] overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Загрузка...</div>
          ) : tree.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Папок пока нет.
              <br />
              Создайте первую сверху.
            </div>
          ) : (
            <TreeView
              nodes={tree}
              expanded={expanded}
              onToggle={toggle}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </Card>

        <div>
          {selected ? (
            <FolderDetail
              folder={selected}
              folders={folders}
              onRename={(name) => update.mutate({ id: selected.id, name })}
              onMove={(parent_id) => update.mutate({ id: selected.id, parent_id })}
              onCreateChild={(name) => create.mutate({ name, parent_id: selected.id })}
              onDelete={() => del.mutate(selected.id)}
              onPlanChange={async (p) => {
                await update.mutateAsync({ id: selected.id, plan_path: p.path, plan_mime: p.mime });
              }}
            />
          ) : (
            <Card className="p-12 text-center text-muted-foreground">
              <FolderIcon className="h-12 w-12 mx-auto mb-3" />
              Выберите папку слева или создайте новую
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function TreeView({
  nodes,
  expanded,
  onToggle,
  selectedId,
  onSelect,
}: {
  nodes: FolderNode[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((n) => {
        const open = expanded.has(n.id);
        const hasChildren = n.children.length > 0;
        return (
          <li key={n.id}>
            <div
              className={cn(
                "flex items-center gap-1 rounded px-1 py-1.5 text-sm cursor-pointer min-h-9",
                selectedId === n.id ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
              onClick={() => onSelect(n.id)}
            >
              <button
                type="button"
                className="p-0.5 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasChildren) onToggle(n.id);
                }}
                aria-label={open ? "Свернуть" : "Развернуть"}
              >
                {hasChildren ? (
                  open ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )
                ) : (
                  <span className="inline-block w-4" />
                )}
              </button>
              <FolderIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">{n.name}</span>
            </div>
            {open && hasChildren && (
              <div className="pl-4 border-l ml-3">
                <TreeView
                  nodes={n.children}
                  expanded={expanded}
                  onToggle={onToggle}
                  selectedId={selectedId}
                  onSelect={onSelect}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NewFolderButton({
  onCreate,
  label,
  size = "sm",
}: {
  onCreate: (name: string) => void;
  label: string;
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!open) {
    return (
      <Button size={size} onClick={() => setOpen(true)}>
        <FolderPlus className="h-4 w-4 sm:mr-1" />
        <span className="hidden sm:inline">{label}</span>
      </Button>
    );
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) {
          onCreate(name.trim());
          setName("");
          setOpen(false);
        }
      }}
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Имя папки"
        className="h-9 w-44"
      />
      <Button type="submit" size="sm">
        OK
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          setOpen(false);
          setName("");
        }}
      >
        ×
      </Button>
    </form>
  );
}

function FolderDetail({
  folder,
  folders,
  onRename,
  onMove,
  onCreateChild,
  onDelete,
  onPlanChange,
}: {
  folder: Folder;
  folders: Folder[];
  onRename: (name: string) => void;
  onMove: (parent_id: string | null) => void;
  onCreateChild: (name: string) => void;
  onDelete: () => void;
  onPlanChange: (p: { path: string | null; mime: string | null }) => Promise<void> | void;
}) {
  const [name, setName] = useState(folder.name);
  // Reset name when switching folder
  if (name !== folder.name && document.activeElement?.tagName !== "INPUT") {
    // noop — relies on React reconciliation; below useState init handles initial value per key
  }
  const { data: props = [] } = useQuery({
    queryKey: ["folder-properties", folder.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id,name,address,status")
        .eq("folder_id", folder.id)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4" key={folder.id}>
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <FolderIcon className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold flex-1 min-w-0 truncate">{folder.name}</h2>
          <NewFolderButton onCreate={onCreateChild} label="Подпапка" />
          <ConfirmButton
            variant="outline"
            size="sm"
            destructive
            title="Удалить папку?"
            description="Папка будет удалена. Объекты внутри нужно сначала перенести."
            confirmText="Удалить"
            onConfirm={onDelete}
          >
            <Trash2 className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Удалить</span>
          </ConfirmButton>
        </div>

        <form
          className="grid sm:grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && name !== folder.name) onRename(name.trim());
          }}
        >
          <div className="space-y-1.5">
            <Label>Название</Label>
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={name === folder.name || !name.trim()}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Родительская папка</Label>
            <FolderPicker
              value={folder.parent_id}
              onChange={(id) => onMove(id)}
              includeRoot
              excludeDescendantsOf={folder.id}
            />
          </div>
        </form>
      </Card>

      <FolderMapMarkup folder={folder} folders={folders} onPlanChange={onPlanChange} />

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Объекты в папке ({props.length})</h3>
          <Button asChild size="sm" variant="outline">
            <Link to="/properties/new">
              <Plus className="h-4 w-4 mr-1" /> Добавить
            </Link>
          </Button>
        </div>
        {props.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />В папке пока нет объектов
          </div>
        ) : (
          <div className="space-y-1.5">
            {props.map((p: any) => (
              <Link
                key={p.id}
                to="/properties/$id"
                params={{ id: p.id }}
                className="flex items-center justify-between gap-2 rounded border p-2 hover:border-primary"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate text-sm">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.address}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function FolderMapMarkup({
  folder,
  folders,
  onPlanChange,
}: {
  folder: Folder;
  folders: Folder[];
  onPlanChange: (p: { path: string | null; mime: string | null }) => Promise<void> | void;
}) {
  const qc = useQueryClient();
  const [url, setUrl] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({ mode: "view" });

  // signed url for plan
  useEffect(() => {
    let cancel = false;
    if (!folder.plan_path) {
      setUrl(null);
      return;
    }
    (async () => {
      const { data } = await supabase.storage
        .from("documents")
        .createSignedUrl(folder.plan_path!, 60 * 60);
      if (!cancel) setUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancel = true;
    };
  }, [folder.plan_path]);

  // All folder IDs whose properties may be shown on this plan = this folder + descendants
  const allFolderIds = useMemo(
    () => Array.from(descendantIds(folders, folder.id)),
    [folders, folder.id],
  );

  const { data: markings = [] } = useFolderMarkings(folder.id);
  const { data: planData } = useFolderPlanProperties(folder.id, allFolderIds);
  const properties = (planData?.properties ?? []) as any[];
  const contractsByProp = (planData?.activeContracts ?? {}) as Record<string, any>;
  const ahchByProp = (planData?.ahchContracts ?? {}) as Record<string, any>;

  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");

  const save = useMutation({
    mutationFn: async (v: { propertyId: string; shape: MarkingShape; coords: any }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("property_markings").upsert(
        {
          owner_id: u.user!.id,
          property_id: v.propertyId,
          folder_id: folder.id,
          shape: v.shape,
          coords: v.coords,
        },
        { onConflict: "property_id,folder_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folder-markings", folder.id] });
      toast.success("Разметка сохранена");
      setEdit({ mode: "view" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (propertyId: string) => {
      const { error } = await supabase
        .from("property_markings")
        .delete()
        .eq("property_id", propertyId)
        .eq("folder_id", folder.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folder-markings", folder.id] });
      toast.success("Удалено");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startDraw = (tool: MarkingShape) => {
    if (!selectedPropertyId) {
      toast.error("Сначала выберите объект");
      return;
    }
    setEdit({ mode: "draw", tool, propertyId: selectedPropertyId, draft: [] });
  };

  const finishPolygon = () => {
    if (edit.mode !== "draw" || edit.tool !== "polygon") return;
    if (edit.draft.length < 3) {
      toast.error("Нужно минимум 3 точки");
      return;
    }
    save.mutate({ propertyId: edit.propertyId, shape: "polygon", coords: { points: edit.draft } });
  };

  const placePoint = (n: { x: number; y: number }) => {
    if (edit.mode !== "draw") return;
    save.mutate({ propertyId: edit.propertyId, shape: "point", coords: { cx: n.x, cy: n.y } });
  };

  const addPoint = (n: { x: number; y: number }) => {
    if (edit.mode !== "draw" || edit.tool !== "polygon") return;
    setEdit({ ...edit, draft: [...edit.draft, [n.x, n.y]] });
  };

  const existing = markings.find((m) => m.property_id === selectedPropertyId);

  const hasUsablePlan = !!folder.plan_path && folder.plan_mime !== "application/pdf";

  if (!hasUsablePlan) {
    return (
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Разметка объектов</h3>
        <PlanUploader
          pathPrefix={`folder-plans/${folder.id}`}
          currentPath={folder.plan_path}
          currentMime={folder.plan_mime}
          onChange={onPlanChange}
        />
      </Card>
    );
  }

  if (!url) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold">Разметка объектов</h3>
        <div className="text-xs text-muted-foreground">
          {markings.length > 0
            ? `Размечено: ${markings.length}`
            : "Наведите курсор на фигуру, чтобы увидеть детали"}
        </div>
      </div>

      <PlanFileControls
        pathPrefix={`folder-plans/${folder.id}`}
        currentPath={folder.plan_path}
        currentMime={folder.plan_mime}
        signedUrl={url}
        onChange={onPlanChange}
      />

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Выберите объект..." />
          </SelectTrigger>
          <SelectContent>
            {properties.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Нет объектов в папке</div>
            ) : (
              properties.map((p) => {
                const marked = markings.some((m) => m.property_id === p.id);
                return (
                  <SelectItem key={p.id} value={p.id}>
                    {marked ? "● " : ""}
                    {p.name}
                  </SelectItem>
                );
              })
            )}
          </SelectContent>
        </Select>

        {edit.mode === "view" ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!selectedPropertyId}
              onClick={() => startDraw("polygon")}
            >
              <Pentagon className="h-4 w-4 mr-1" /> Многоугольник
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!selectedPropertyId}
              onClick={() => startDraw("point")}
            >
              <MapPin className="h-4 w-4 mr-1" /> Маркер
            </Button>
            {existing && (
              <ConfirmButton
                variant="outline"
                size="sm"
                destructive
                title="Удалить разметку?"
                description="Фигура объекта на этом плане будет удалена."
                confirmText="Удалить"
                onConfirm={() => del.mutate(selectedPropertyId)}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Стереть
              </ConfirmButton>
            )}
          </>
        ) : (
          <>
            <div className="text-xs text-muted-foreground px-2">
              {edit.tool === "polygon"
                ? `Кликайте для добавления точек (${edit.draft.length}). Двойной клик — завершить.`
                : "Кликните на план, чтобы поставить маркер."}
            </div>
            {edit.tool === "polygon" && (
              <Button
                type="button"
                size="sm"
                onClick={finishPolygon}
                disabled={edit.draft.length < 3}
              >
                <Check className="h-4 w-4 mr-1" /> Готово
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEdit({ mode: "view" })}
            >
              <X className="h-4 w-4 mr-1" /> Отмена
            </Button>
          </>
        )}
      </div>

      <PlanViewer
        src={url}
        overlay={(ctx) => (
          <PlanMarkup
            ctx={ctx}
            markings={markings as Marking[]}
            properties={properties as any}
            contractsByProp={contractsByProp}
            ahchByProp={ahchByProp}
            edit={edit}
            onAddPoint={addPoint}
            onFinishPolygon={finishPolygon}
            onPlacePoint={placePoint}
          />
        )}
      />
    </Card>
  );
}
