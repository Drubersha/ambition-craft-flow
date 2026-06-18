import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TenantForm, type TenantFormValues } from "@/components/tenant-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Trash2, FileText } from "lucide-react";
import { CONTRACT_STATUS_LABELS, formatDate, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/tenants/$id")({
  component: EditTenant,
});

function EditTenant() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["tenant", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: contracts } = useQuery({
    queryKey: ["tenant-contracts", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts")
        .select("*, property:properties(name)").eq("tenant_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const mut = useMutation({
    mutationFn: async (v: TenantFormValues) => {
      const { error } = await supabase.from("tenants").update({
        name: v.name, kind: v.kind as any,
        inn: v.inn || null, phone: v.phone || null, email: v.email || null,
        contact_person: v.contact_person || null, notes: v.notes || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant", id] });
      qc.invalidateQueries({ queryKey: ["tenants"] });
      toast.success("Сохранено");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tenants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tenants"] }); toast.success("Удалено"); navigate({ to: "/tenants" }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !data) return <div>Загрузка...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/tenants"><ArrowLeft className="h-4 w-4 mr-1" /> К списку</Link></Button>
        <Button variant="destructive" size="sm" onClick={() => { if (confirm("Удалить арендатора?")) del.mutate(); }}>
          <Trash2 className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Удалить</span>
        </Button>
      </div>
      <h1 className="text-xl sm:text-2xl font-bold break-words">{data.name}</h1>
      <TenantForm
        initial={{
          name: data.name, kind: data.kind,
          inn: data.inn ?? "", phone: data.phone ?? "", email: data.email ?? "",
          contact_person: data.contact_person ?? "", notes: data.notes ?? "",
        }}
        onSubmit={(v) => mut.mutate(v)} submitting={mut.isPending}
      />

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Договоры арендатора</h2>
          <Button size="sm" asChild><Link to="/contracts/new" search={{ tenant: id } as any}>Новый договор</Link></Button>
        </div>
        {(!contracts || contracts.length === 0) ? (
          <Card className="p-6 text-sm text-muted-foreground text-center">Договоров пока нет.</Card>
        ) : (
          <div className="space-y-2">
            {contracts.map((c: any) => (
              <Link key={c.id} to="/contracts/$id" params={{ id: c.id }}>
                <Card className="p-3 hover:border-primary transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium break-all">№ {c.number}</span>
                      <Badge variant="secondary">{CONTRACT_STATUS_LABELS[c.status]}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 break-words">
                      {c.property?.name} · {c.area ?? "—"} м² · {formatMoney(c.rate, c.currency)} · {formatDate(c.start_date)} → {formatDate(c.end_date)}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}