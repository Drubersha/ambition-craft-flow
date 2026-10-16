import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Construction, MessageSquarePlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leads/")({
  component: LeadsUnderConstruction,
});

/** Диагональная «строительная лента» (жёлто-чёрные полосы). */
function ConstructionTape({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-8 w-[120%] -mx-[10%] shadow-md ${className}`}
      style={{
        background: "repeating-linear-gradient(45deg, #facc15 0 24px, #1c1917 24px 48px)",
      }}
    />
  );
}

/**
 * Раздел временно закрыт: воронка вернётся вместе с интеграциями Авито/Циан.
 * Код воронки (канбан, диалоги, архив) удалён как недостижимый; полная версия —
 * в истории git до коммита 881800c (src/routes/_authenticated/leads.index.tsx).
 */
function LeadsUnderConstruction() {
  return (
    <div className="relative overflow-hidden py-6">
      <ConstructionTape className="rotate-[-3deg] mb-10" />
      <Card className="mx-auto max-w-xl p-8 text-center space-y-4 border-yellow-400/60">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-yellow-400/15 text-yellow-500">
          <Construction className="h-7 w-7" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold">Раздел «Воронка» в разработке</h1>
        <p className="text-sm text-muted-foreground">
          Мы готовим воронку заявок к запуску: планируется интеграция с{" "}
          <span className="font-medium text-foreground">Авито</span> и{" "}
          <span className="font-medium text-foreground">Циан</span> — обращения с площадок будут
          попадать сюда автоматически.
        </p>
        <Button asChild className="w-full sm:w-auto">
          <Link to="/faq">
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            Если необходимы ещё какие-либо интеграции — напишите сюда
          </Link>
        </Button>
      </Card>
      <ConstructionTape className="rotate-[3deg] mt-10" />
    </div>
  );
}
