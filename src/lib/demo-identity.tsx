import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type DemoRole = "owner" | "manager" | "tenant";

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

function readInitial(): { role: DemoRole; tenantId: string | null } {
  if (typeof window === "undefined") return { role: "owner", tenantId: null };
  const r = (localStorage.getItem(ROLE_KEY) as DemoRole | null) ?? "owner";
  const t = localStorage.getItem(TENANT_KEY);
  return { role: r === "owner" || r === "manager" || r === "tenant" ? r : "owner", tenantId: t };
}

export function DemoIdentityProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<DemoRole>("owner");
  const [tenantId, setTenantIdState] = useState<string | null>(null);

  useEffect(() => {
    const init = readInitial();
    setRoleState(init.role);
    setTenantIdState(init.tenantId);
  }, []);

  const setRole = (r: DemoRole) => {
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
  owner: "Главный",
  manager: "Менеджер",
  tenant: "Арендатор",
};