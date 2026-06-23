import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useDemoIdentity } from "@/lib/demo-identity";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  component: IndexPage,
});

function IndexPage() {
  const navigate = useNavigate();
  const { role } = useDemoIdentity();
  useEffect(() => {
    navigate({ to: role === "tenant" ? "/me" : "/dashboard", replace: true });
  }, [navigate, role]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    </div>
  );
}