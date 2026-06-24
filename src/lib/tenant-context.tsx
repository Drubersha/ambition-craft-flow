import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyTenantContext, type ResolvedTenant } from "@/lib/tenant-context.functions";
import { useDemoIdentity } from "@/lib/demo-identity";

const SELECTED_KEY = "me.selectedTenantId";

export type TenantContextState =
  | { status: "loading" }
  | { status: "no-link"; reason: "no-link" | "no-email" | "no-tenant-row" }
  | { status: "multi"; tenants: ResolvedTenant[]; select: (id: string) => void }
  | { status: "ready"; tenantId: string; source: "demo" | "real"; tenant?: ResolvedTenant; tenants: ResolvedTenant[]; select: (id: string) => void };

/**
 * Resolve the active tenant for the `/me/*` cabinet.
 *
 * Priority:
 * 1. Demo: `useDemoIdentity().tenantId` set via the demo switcher.
 * 2. Real: server-resolved via `user_links` + email match.
 * 3. Multi: if several tenant rows match, the user picks one (cached in
 *    sessionStorage so the choice survives navigation).
 */
export function useTenantContext(): TenantContextState {
  const { tenantId: demoTenantId } = useDemoIdentity();
  const fetchCtx = useServerFn(getMyTenantContext);
  const [selected, setSelectedState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(SELECTED_KEY);
  });

  const { data, isLoading } = useQuery({
    queryKey: ["my-tenant-context"],
    queryFn: () => fetchCtx(),
    staleTime: 60_000,
    enabled: !demoTenantId, // demo path resolves locally
  });

  function select(id: string) {
    setSelectedState(id);
    if (typeof window !== "undefined") sessionStorage.setItem(SELECTED_KEY, id);
  }

  // Demo override wins.
  useEffect(() => {
    if (demoTenantId && typeof window !== "undefined") {
      sessionStorage.removeItem(SELECTED_KEY);
    }
  }, [demoTenantId]);

  if (demoTenantId) {
    return {
      status: "ready",
      tenantId: demoTenantId,
      source: "demo",
      tenants: [],
      select,
    };
  }

  if (isLoading || !data) return { status: "loading" };

  if (!data.hasLink) return { status: "no-link", reason: "no-link" };
  if (!data.email) return { status: "no-link", reason: "no-email" };
  if (data.tenants.length === 0) return { status: "no-link", reason: "no-tenant-row" };

  if (data.tenants.length === 1) {
    return {
      status: "ready",
      tenantId: data.tenants[0].id,
      source: "real",
      tenant: data.tenants[0],
      tenants: data.tenants,
      select,
    };
  }

  const picked = selected && data.tenants.find((t) => t.id === selected);
  if (picked) {
    return {
      status: "ready",
      tenantId: picked.id,
      source: "real",
      tenant: picked,
      tenants: data.tenants,
      select,
    };
  }

  return { status: "multi", tenants: data.tenants, select };
}