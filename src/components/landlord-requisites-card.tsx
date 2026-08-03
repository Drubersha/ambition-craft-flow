/**
 * Реквизиты арендодателя (ваши собственные) — юрлицо/ИП, адреса, банк.
 * Хранятся в profiles, потому что это данные владельца аккаунта, а не
 * арендатора. Нужны в шапке договоров, счетах и актах: раньше их не было
 * нигде, и каждый документ приходилось дописывать руками.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

const FIELDS = [
  { key: "short_name", label: "Краткое наименование", hint: "ИП Марченко Э. В." },
  { key: "inn", label: "ИНН" },
  { key: "ogrn", label: "ОГРН / ОГРНИП" },
  {
    key: "registration_basis",
    label: "Действует на основании",
    hint: "Свидетельство серия … №… от …",
  },
  { key: "legal_address", label: "Юридический адрес" },
  { key: "postal_address", label: "Почтовый адрес" },
  { key: "bank_name", label: "Банк" },
  { key: "bank_account", label: "Расчётный счёт" },
  { key: "bank_bik", label: "БИК" },
  { key: "bank_corr_account", label: "Корреспондентский счёт" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type Values = Record<FieldKey, string>;

const EMPTY = Object.fromEntries(FIELDS.map((f) => [f.key, ""])) as Values;

export function LandlordRequisitesCard() {
  const qc = useQueryClient();
  const [v, setV] = useState<Values>(EMPTY);

  const { data } = useQuery({
    queryKey: ["landlord-requisites"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!data) return;
    setV(
      Object.fromEntries(
        FIELDS.map((f) => [f.key, (data as Record<string, unknown>)[f.key] ?? ""]),
      ) as Values,
    );
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Не удалось определить пользователя");
      // Собираем через reduce, а не Object.fromEntries: последний даёт строковую
      // индексную сигнатуру, которую типы Supabase не принимают.
      const patch = FIELDS.reduce(
        (acc, f) => {
          acc[f.key] = v[f.key].trim() || null;
          return acc;
        },
        {} as Record<FieldKey, string | null>,
      );
      const { error } = await supabase.from("profiles").update(patch).eq("id", u.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landlord-requisites"] });
      toast.success("Реквизиты сохранены");
    },
    onError: (e: any) => toast.error(e.message ?? "Не удалось сохранить"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" /> Мои реквизиты (арендодатель)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Подставляются в договоры, счета и акты. Заполняются один раз.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 max-w-3xl">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label>{f.label}</Label>
              <Input
                value={v[f.key]}
                placeholder={"hint" in f ? f.hint : undefined}
                onChange={(e) => setV((p) => ({ ...p, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Сохранение…" : "Сохранить реквизиты"}
        </Button>
      </CardContent>
    </Card>
  );
}
