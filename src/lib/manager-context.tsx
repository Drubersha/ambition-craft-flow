import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyManagerContext, type LinkedOwner } from "@/lib/manager-context.functions";
import { useDemoIdentity } from "@/lib/demo-identity";

const SELECTED_KEY = "manager.selectedOwnerId";

type State =
  | { status: "loading" }
  | { status: "not-manager" }
  | {
      status: "ready";
      owners: LinkedOwner[];
      selectedOwnerId: string;
      setSelectedOwnerId: (id: string) => void;
    };

const Ctx = createContext<State>({ status: "loading" });

/**
 * Manager context: resolves which owners the current REAL auth user can act
 * on behalf of via `user_links(role='manager')`, plus the currently selected
 * one (cached in sessionStorage when multiple).
 *
 * This is separate from the demo role switcher: switching the demo role to
 * "manager" does NOT change the real session, so demo manager view keeps
 * working without consulting this provider.
 */
export function ManagerContextProvider({ children }: { children: ReactNode }) {
  const fetchCtx = useServerFn(getMyManagerContext);
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (active) setHasSession(!!s);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const q = useQuery({
    queryKey: ["my-manager-context"],
    queryFn: () => fetchCtx(),
    enabled: hasSession,
    staleTime: 60_000,
    retry: false,
  });

  const [selected, setSelected] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(SELECTED_KEY);
  });

  // Auto-select first owner when manager has exactly one link, or when the
  // cached selection no longer matches the available owners.
  useEffect(() => {
    if (!q.data || !q.data.isManager) return;
    const ids = q.data.owners.map((o) => o.owner_user_id);
    if (ids.length === 0) return;
    if (!selected || !ids.includes(selected)) {
      const next = ids[0];
      setSelected(next);
      if (typeof window !== "undefined") sessionStorage.setItem(SELECTED_KEY, next);
    }
  }, [q.data, selected]);

  const value: State = useMemo(() => {
    if (!hasSession || q.isLoading) return { status: "loading" };
    if (!q.data || !q.data.isManager) return { status: "not-manager" };
    return {
      status: "ready",
      owners: q.data.owners,
      selectedOwnerId: selected ?? q.data.owners[0]?.owner_user_id ?? "",
      setSelectedOwnerId: (id: string) => {
        setSelected(id);
        if (typeof window !== "undefined") sessionStorage.setItem(SELECTED_KEY, id);
      },
    };
  }, [hasSession, q.isLoading, q.data, selected]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useManagerContext(): State {
  return useContext(Ctx);
}

/**
 * Resolve the owner id to write data against.
 *
 * - Real authenticated user without manager links: their own `auth.uid()`.
 * - Real linked manager: the currently selected linked owner.
 * - Demo role "manager": ignored — demo accounts always insert under their
 *   own `auth.uid()` (RLS on demo data is permissive).
 *
 * Returns `null` while loading or when no resolution is possible yet.
 */
export function useEffectiveOwnerId(): {
  ownerId: string | null;
  isLinkedManager: boolean;
  isLoading: boolean;
} {
  const mctx = useManagerContext();
  const { role } = useDemoIdentity();
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    let a = true;
    supabase.auth.getUser().then(({ data }) => {
      if (a) setMeId(data.user?.id ?? null);
    });
    return () => {
      a = false;
    };
  }, []);

  if (mctx.status === "loading") return { ownerId: null, isLinkedManager: false, isLoading: true };
  if (mctx.status === "ready" && role !== "tenant") {
    return { ownerId: mctx.selectedOwnerId || null, isLinkedManager: true, isLoading: false };
  }
  return { ownerId: meId, isLinkedManager: false, isLoading: !meId };
}
