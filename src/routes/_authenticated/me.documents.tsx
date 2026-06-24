import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTenantContext } from "@/lib/tenant-context";
import { getDocumentSignedUrl } from "@/lib/documents.functions";
import { Download, FileText } from "lucide-react";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/me/documents")({
  component: MyDocs,
});

function MyDocs() {
  const ctx = useTenantContext();
  const tenantId = ctx.status === "ready" ? ctx.tenantId : null;

  const { data, isLoading, error } = useQuery({
    queryKey: ["me-docs", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: contracts, error: cErr } = await supabase
        .from("contracts")
        .select("id, number")
        .eq("tenant_id", tenantId!);
      if (cErr) throw cErr;
      const ids = (contracts ?? []).map((c) => c.id);

      const queries: Promise<any>[] = [];
      // Contract documents
      if (ids.length > 0) {
        queries.push(
          supabase
            .from("documents")
            .select("id, label, storage_path, mime_type, size_bytes, created_at, ref_id, owner_kind")
            .eq("owner_kind", "contract" as any)
            .in("ref_id", ids),
        );
      }
      // Tenant documents
      queries.push(
        supabase
          .from("documents")
          .select("id, label, storage_path, mime_type, size_bytes, created_at, ref_id, owner_kind")
          .eq("owner_kind", "tenant" as any)
          .eq("ref_id", tenantId!),
      );

      const results = await Promise.all(queries);
      const docs = results
        .flatMap((r) => (r.error ? [] : r.data ?? []))
        .sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
      return { contracts: contracts ?? [], docs };
    },
  });

  if (ctx.status === "loading" || isLoading) {
    return <div className="text-sm text-muted-foreground">Загрузка…</div>;
  }
  if (error) {
    return (
      <Card className="p-6 text-center text-sm text-destructive">
        Не удалось загрузить документы.
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      <h1 className="text-xl sm:text-2xl font-bold">Документы</h1>
      {!data || data.docs.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Документов нет.</Card>
      ) : (
        <div className="space-y-2">
          {data.docs.map((d: any) => (
            <DocRow key={d.id} doc={d} contracts={data.contracts} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocRow({ doc, contracts }: { doc: any; contracts: any[] }) {
  const [busy, setBusy] = useState(false);
  const contract = contracts.find((c) => c.id === doc.ref_id);
  const getUrl = useServerFn(getDocumentSignedUrl);

  async function download() {
    setBusy(true);
    try {
      const res = await getUrl({ data: { documentId: doc.id } });
      window.open(res.url, "_blank");
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (/не найден/i.test(msg)) toast.error("Файл не найден");
      else if (/прав/i.test(msg) || /forbidden/i.test(msg)) toast.error("Нет прав на документ");
      else toast.error("Документ недоступен");
    } finally {
      setBusy(false);
    }
  }

  const title =
    doc.label ?? (typeof doc.storage_path === "string" ? doc.storage_path.split("/").pop() : "Документ");
  const subtitle =
    doc.owner_kind === "contract" && contract?.number
      ? `Договор № ${contract.number} · ${formatDate(doc.created_at)}`
      : doc.owner_kind === "tenant"
        ? `Арендатор · ${formatDate(doc.created_at)}`
        : formatDate(doc.created_at);

  return (
    <Card className="p-3 flex items-center gap-3">
      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm truncate">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <Button size="sm" variant="outline" onClick={download} disabled={busy}>
        <Download className="h-4 w-4 mr-1" /> Скачать
      </Button>
    </Card>
  );
}
