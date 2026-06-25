import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useDemoIdentity } from "@/lib/demo-identity";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/")({
  ssr: false,
  component: IndexPage,
  head: () => ({
    // Relative URLs let browsers/crawlers resolve against the current host,
    // so SEO stays correct on Lovable, self-hosted, and custom domains.
    links: [{ rel: "canonical", href: "/" }],
    meta: [{ property: "og:url", content: "/" }],
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
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <BrandLogo variant="lockup" size="md" />
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    </div>
  );
}
