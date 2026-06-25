import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyRoles } from "@/lib/my-roles.functions";
import { supabase } from "@/integrations/supabase/client";

export type DemoRole = "owner" | "manager" | "tenant" | "developer" | "moderator";

type Identity = {
  role: DemoRole;
  tenantId: string | null;
  setRole: (r: DemoRole) => void;
  setTenantId: (id: string | null) => void;
  viewAsTenant: (id: string) => void;
  exitTenant: () => void;
};

const Ctx = createContext<Identity | null>(null);

const ROLE_KEY = "demo.role";
const TENANT_KEY = "demo.tenantId";

// Roles that grant privileged UI (admin pages, moderator tools) MUST be
// verified against the server. Owner/manager/tenant views are RLS-scoped, so
// switching to them client-side cannot leak data.
const PRIVILEGED: DemoRole[] = ["developer", "moderator"];

function readTenantId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TENANT_KEY);
}

export function DemoIdentityProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<DemoRole>("owner");
  const [tenantId, setTenantIdState] = useState<string | null>(null);
  const [serverRoles, setServerRoles] = useState<string[] | null>(null);
  const fetchRoles = useServerFn(getMyRoles);

  useEffect(() => {
    setTenantIdState(readTenantId());
    let active = true;

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (active) setServerRoles([]);
        return;
      }
      try {
        const res = await fetchRoles();
        if (!active) return;
        const roles = res?.roles ?? [];
        setServerRoles(roles);
        // Honour saved preference only if user actually owns that role.
        const stored =
          typeof window !== "undefined"
            ? (localStorage.getItem(ROLE_KEY) as DemoRole | null)
            : null;
        const allowed: DemoRole[] = ["owner", "manager", "tenant"];
        for (const r of PRIVILEGED) if (roles.includes(r)) allowed.push(r);
        if (stored && allowed.includes(stored)) setRoleState(stored);
        else
          setRoleState(
            roles.includes("developer")
              ? "developer"
              : roles.includes("moderator")
                ? "moderator"
                : "owner",
          );
      } catch {
        if (active) setServerRoles([]);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [fetchRoles]);

  const setRole = (r: DemoRole) => {
    // Block escalation into privileged roles unless server confirmed them.
    if (PRIVILEGED.includes(r) && !(serverRoles ?? []).includes(r)) {
      console.warn("[demo-identity] refused privileged role switch:", r);
      return;
    }
    setRoleState(r);
    if (typeof window !== "undefined") localStorage.setItem(ROLE_KEY, r);
  };
  const setTenantId = (id: string | null) => {
    setTenantIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(TENANT_KEY, id);
      else localStorage.removeItem(TENANT_KEY);
    }
  };
  const viewAsTenant = (id: string) => {
    setRole("tenant");
    setTenantId(id);
  };
  const exitTenant = () => {
    setRole("owner");
  };

  return (
    <Ctx.Provider value={{ role, tenantId, setRole, setTenantId, viewAsTenant, exitTenant }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDemoIdentity(): Identity {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDemoIdentity must be used inside DemoIdentityProvider");
  return v;
}

export const ROLE_LABELS: Record<DemoRole, string> = {
  owner: "Арендодатель",
  manager: "Менеджер",
  tenant: "Арендатор",
  developer: "Разработчик",
  moderator: "Модератор",
};
