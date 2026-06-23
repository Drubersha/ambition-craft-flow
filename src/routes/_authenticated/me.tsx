import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDemoIdentity } from "@/lib/demo-identity";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/me")({
  component: TenantLayout,
});

function TenantLayout() {
  const { role, tenantId, setRole } = useDemoIdentity();
  const navigate = useNavigate();

  const { data: tenant } = useQuery({
    queryKey: ["me-tenant", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, phone, email, inn")
        .eq("id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (role !== "tenant") {
    return (
      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">Кабинет арендатора</h2>
        <p className="text-sm text-muted-foreground">
          Чтобы войти в кабинет, выберите слева роль «Арендатор» и нужного арендатора.
        </p>
        <Button onClick={() => setRole("tenant")}>Войти как арендатор</Button>
      </Card>
    );
  }

  if (!tenantId) {
    return (
      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">Выберите арендатора</h2>
        <p className="text-sm text-muted-foreground">
          В демо-режиме слева выберите арендатора, от лица которого вы хотите смотреть систему.
        </p>
        <Button asChild variant="outline"><Link to="/tenants">К списку арендаторов</Link></Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase text-muted-foreground">Кабинет арендатора</div>
          <div className="font-semibold truncate">{tenant?.name ?? "…"}</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setRole("owner"); navigate({ to: "/dashboard" }); }}
        >
          <LogOut className="h-4 w-4 mr-1" /> Выйти из режима
        </Button>
      </Card>
      <Outlet />
    </div>
  );
}