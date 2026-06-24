import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SignedDocUrl = {
  url: string;
  expiresIn: number;
  fileName: string;
};

/**
 * Create a short-lived signed URL for a document in the `documents` storage
 * bucket after authorising the caller server-side.
 *
 * Access rules:
 *  - owner of the document (documents.owner_id = auth.uid) — always allowed.
 *  - linked manager of the owner (user_links role='manager') — allowed.
 *  - linked tenant of the owner, AND the document belongs to that tenant's
 *    own contract / tenant record (via `tenant_can_access_document`).
 *
 * The signed URL itself is minted with the service role because the storage
 * RLS policies bind reads to the owner's folder; the tenant has no direct
 * access to `storage.objects` for the owner's path.
 */
export const getDocumentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string }) => {
    if (!data?.documentId || typeof data.documentId !== "string") {
      throw new Error("documentId is required");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<SignedDocUrl> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: doc, error: docErr } = await supabaseAdmin
      .from("documents")
      .select("id, owner_id, storage_path, owner_kind, ref_id, label")
      .eq("id", data.documentId)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("Документ не найден");

    let allowed = doc.owner_id === context.userId;

    if (!allowed) {
      const { data: isManager } = await context.supabase.rpc("is_linked_member", {
        _owner: doc.owner_id,
        _member: context.userId,
        _role: "manager",
      });
      if (isManager === true) allowed = true;
    }

    if (!allowed) {
      const { data: isTenantDoc } = await context.supabase.rpc(
        "tenant_can_access_document",
        { _doc_id: doc.id },
      );
      if (isTenantDoc === true) allowed = true;
    }

    if (!allowed) throw new Error("Нет прав на этот документ");

    const expiresIn = 3600;
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, expiresIn);
    if (sErr || !signed?.signedUrl) {
      throw new Error("Файл не найден в хранилище");
    }

    const fileName = doc.label || doc.storage_path.split("/").pop() || "document";
    return { url: signed.signedUrl, expiresIn, fileName };
  });
