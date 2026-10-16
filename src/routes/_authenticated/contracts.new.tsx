import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ContractForm, type ContractFormValues } from "@/components/contract-form";
import { contractFormFromRow, contractRowFromForm } from "@/lib/contracts";
import { diffContractTerms, termsToApply } from "@/lib/amendments";
import { toast } from "sonner";
import { z } from "zod";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { Button } from "@/components/ui/button";
import { useEffectiveOwnerId } from "@/lib/manager-context";
import { insertContractMeters } from "@/lib/meters";
import { humanError } from "@/lib/human-error";

const search = z.object({
  tenant: z.string().optional(),
  property: z.string().optional(),
  /** Договор, к которому создаётся допсоглашение. */
  parent: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/contracts/new")({
  validateSearch: search,
  component: NewContract,
});

function NewContract() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sp = useSearch({ from: "/_authenticated/contracts/new" });
  const { ownerId } = useEffectiveOwnerId();
  const parentId = sp.parent;

  const { data: parent, isLoading: parentLoading } = useQuery({
    queryKey: ["contract-parent-for-new", parentId],
    enabled: Boolean(parentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", parentId!)
        .single();
      if (error) throw error;
      return data as Record<string, any>;
    },
  });

  const mut = useMutation({
    mutationFn: async (v: ContractFormValues) => {
      if (!ownerId) throw new Error("Не удалось определить арендодателя");
      const row = contractRowFromForm(v);
      const { data, error } = await supabase
        .from("contracts")
        .insert({
          owner_id: ownerId,
          ...row,
          ...(parentId ? { parent_contract_id: parentId } : {}),
        })
        .select()
        .single();
      if (error) throw error;

      // Основной договор хранит действующие условия — их читают дашборд,
      // начисления и отчёты. Переносим в него то, что изменил допник.
      let applied = 0;
      if (parentId && parent) {
        const changes = diffContractTerms(parent, data as Record<string, unknown>);
        const patch = termsToApply(changes, data as Record<string, unknown>);
        if (Object.keys(patch).length > 0) {
          // patch собран из полей самого договора, но типы Supabase не
          // принимают Record<string, unknown> — состав ключей проверен в
          // termsToApply и покрыт тестами.
          const { error: upErr } = await supabase
            .from("contracts")
            .update(patch as never)
            .eq("id", parentId);
          if (upErr) {
            throw new Error(
              `Допсоглашение сохранено, но условия основного договора не обновились: ${upErr.message}`,
            );
          }
          applied = changes.length;
        }
      }

      if (!parentId) {
        try {
          await insertContractMeters({
            ownerId,
            contractId: data.id,
            propertyId: v.property_id,
            drafts: v.meters,
          });
        } catch (e: any) {
          throw new Error(`Договор создан, но счётчики не сохранились: ${e.message}`);
        }
      }
      return { data, applied };
    },
    onSuccess: ({ data, applied }) => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      qc.invalidateQueries({ queryKey: ["meters"] });
      if (parentId) {
        qc.invalidateQueries({ queryKey: ["contract", parentId] });
        qc.invalidateQueries({ queryKey: ["contract-amendments", parentId] });
        qc.invalidateQueries({ queryKey: ["dashboard-raw"] });
        toast.success(
          applied > 0
            ? `Допсоглашение создано, условий обновлено в договоре: ${applied}`
            : "Допсоглашение создано (условия договора не изменились)",
        );
        navigate({ to: "/contracts/$id", params: { id: parentId } });
      } else {
        toast.success("Договор создан");
        navigate({ to: "/contracts/$id", params: { id: data.id } });
      }
    },
    onError: (e: any) => toast.error(humanError(e)),
  });

  if (parentId && parentLoading) return <div className="p-6">Загрузка договора…</div>;

  const initial = parent
    ? // Допник берёт условия основного договора; номер, заметки и предмет заполняются заново.
      { ...contractFormFromRow(parent), number: "", notes: "", amendment_subject: "" }
    : { tenant_id: sp.tenant ?? "", property_id: sp.property ?? "" };

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">
        {parentId ? "Новое допсоглашение" : "Новый договор"}
      </h1>
      {parent && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
          <div>
            К договору <span className="font-medium">{parent.number || "б/н"}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Поля заполнены текущими условиями договора. Измените только то, что меняет
            допсоглашение, — программа сама определит разницу и перенесёт новые условия в договор.
            История останется в допсоглашении.
          </p>
        </div>
      )}
      <ContractForm
        formId="contract-new-form"
        isAmendment={Boolean(parentId)}
        initial={initial}
        onSubmit={(v) => mut.mutate(v)}
        submitting={mut.isPending}
      />
      <MobileActionBar>
        <Button
          type="submit"
          form="contract-new-form"
          size="lg"
          className="flex-1 min-h-11"
          disabled={mut.isPending}
        >
          {mut.isPending ? "Сохранение..." : parentId ? "Создать допсоглашение" : "Создать договор"}
        </Button>
      </MobileActionBar>
    </div>
  );
}
