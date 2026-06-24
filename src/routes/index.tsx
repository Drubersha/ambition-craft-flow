import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useDemoIdentity } from "@/lib/demo-identity";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  component: IndexPage,
  head: () => ({
    links: [{ rel: "canonical", href: "https://ambition-craft-flow.lovable.app/" }],
    meta: [{ property: "og:url", content: "https://ambition-craft-flow.lovable.app/" }],
  }),
});

function IndexPage() {
  const navigate = useNavigate();
  const { role } = useDemoIdentity();
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      navigate({ to: role === "tenant" ? "/me" : "/dashboard", replace: true });
    })();
  }, [navigate, role]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    </div>
  );
}