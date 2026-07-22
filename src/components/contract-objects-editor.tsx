/**
 * Редактор состава составного договора: какие объекты входят в договор и с
 * какой площадью каждый. Пустой список — обычный договор с одним объектом
 * (тем, что выбран в форме). Площади связок обычно складываются в договорную
 * площадь — при расхождении показывается подсказка, но оно не запрещено:
 * связки могут покрывать не всё (пример — договор Марченко).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatNum } from "@/lib/format";

type LinkRow = {
  id: string;
  area: number;
  property: { id: string; name: string; type: string } | null;
};

function AreaCell({
  link,
  unitLabel,
  onSave,
}: {
  link: LinkRow;
  unitLabel: string;
  onSave: (id: string, area: number) => void;
}) {
  const [val, setVal] = useState(String(link.area));
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        step="0.01"
        min="0"
        className="h-8 w-24 text-right"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          const n = Number(val);
          if (!isNaN(n) && n >= 0 && Math.abs(n - Number(link.area)) > 0.004) {
            onSave(link.id, n);
          } else {
            setVal(String(link.area));
          }
        }}
      />
      <span className="text-xs text-muted-foreground w-8">{unitLabel}</span>
    </div>
  );
}

export function ContractObjectsEditor({
  contractId,
  ownerId,
  unit,
  contractArea,
}: {
  contractId: string;
  ownerId: string;
  unit: string;
  contractArea: number;
}) {
  const qc = useQueryClient();
  const unitLabel = unit === "space" ? "мест" : unit === "lot" ? "лотов" : "м²";
  const [newPropId, setNewPropId] = useState("");
  const [newArea, setNewArea] = useState("");

  const { data: links } = useQuery({
    queryKey: ["contract-objects", contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_properties")
        .select("id,area,property:properties(id,name,type)")
        .eq("contract_id", contractId)
        .order("area", { ascending: false });
      if (error) throw error;
      return data as unknown as LinkRow[];
    },
  });

  const { data: properties } = useQuery({
    queryKey: ["properties-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id,name,type,area_total")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["contract-objects", contractId] });
    qc.invalidateQueries({ queryKey: ["dashboard-raw"] });
  };

  const addMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contract_properties").insert({
        owner_id: ownerId,
        contract_id: contractId,
        property_id: newPropId,
        area: Number(newArea) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewPropId("");
      setNewArea("");
      invalidate();
    },
    onError: (e: any) =>
      toast.error(
        e?.code === "23505" ? "Этот объект уже есть в договоре" : (e?.message ?? "Не удалось"),
      ),
  });

  const updMut = useMutation({
    mutationFn: async ({ id, area }: { id: string; area: number }) => {
      const { error } = await supabase.from("contract_properties").update({ area }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Не удалось сохранить площадь"),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contract_properties").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Не удалось удалить"),
  });

  const linkedSum = (links ?? []).reduce((s, l) => s + Number(l.area), 0);
  const mismatch = (links ?? []).length > 0 && Math.abs(linkedSum - contractArea) > 0.01;

  return (
    <div className="space-y-2">
      {(links ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">
          Обычный договор с одним объектом. Добавьте объекты, если один договор охватывает несколько
          помещений или участков — площади и занятость разложатся по ним.
        </p>
      )}
      {(links ?? []).map((l) => (
        <div
          key={l.id}
          className="flex items-center justify-between gap-3 text-sm border rounded-md px-3 py-1.5"
        >
          <span className="min-w-0 truncate">{l.property?.name ?? "Объект удалён"}</span>
          <div className="flex items-center gap-1">
            <AreaCell
              link={l}
              unitLabel={unitLabel}
              onSave={(id, area) => updMut.mutate({ id, area })}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => delMut.mutate(l.id)}
              disabled={delMut.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
      {mismatch && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Связки покрывают {formatNum(linkedSum)} {unitLabel} из {formatNum(contractArea)}{" "}
          {unitLabel} по договору.
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Select
          value={newPropId}
          onValueChange={(id) => {
            setNewPropId(id);
            if (!newArea) {
              const p: any = (properties ?? []).find((x: any) => x.id === id);
              if (p?.area_total) setNewArea(String(p.area_total));
            }
          }}
        >
          <SelectTrigger className="h-8 flex-1 min-w-0">
            <SelectValue placeholder="Объект…" />
          </SelectTrigger>
          <SelectContent>
            {(properties ?? []).map((p: any) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          step="0.01"
          min="0"
          placeholder={unitLabel}
          className="h-8 w-24 text-right"
          value={newArea}
          onChange={(e) => setNewArea(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={!newPropId || addMut.isPending}
          onClick={() => addMut.mutate()}
        >
          <Plus className="h-4 w-4 mr-1" />
          Добавить
        </Button>
      </div>
    </div>
  );
}
