import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTenantContext } from "@/lib/tenant-context";
import { Download, FileText } from "lucide-react";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/me/documents")({
  component: MyDocs,
});

function MyDocs() {
  const ctx = useTenantContext();
  const tenantId = ctx.status === "ready" ? ctx.tenantId : null;
  const { data } = useQuery({
    queryKey: ["me-docs", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: contracts } = await supabase
        .from("contracts")
        .select("id, number")
        .eq("tenant_id", tenantId!);
      const ids = (contracts ?? []).map((c) => c.id);
      if (ids.length === 0) return { contracts: [], docs: [] };
      const { data: docs, error } = await supabase
        .from("documents")
        .select("id, label, storage_path, mime_type, size_bytes, created_at, ref_id, owner_kind")
        .eq("owner_kind", "contract" as any)
        .in("ref_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return { contracts: contracts ?? [], docs: docs ?? [] };
    },
  });
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
  async function download() {
    setBusy(true);
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.storage_path, 3600);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-3 flex items-center gap-3">
      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm truncate">{doc.label ?? doc.storage_path.split("/").pop()}</div>
        <div className="text-xs text-muted-foreground">
          {contract?.number ? `Договор № ${contract.number} · ` : ""}{formatDate(doc.created_at)}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={download} disabled={busy}>
        <Download className="h-4 w-4 mr-1" /> Скачать
      </Button>
    </Card>
  );
}