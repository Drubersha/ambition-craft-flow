import { createFileRoute } from "@tanstack/react-router";
import { ChargesListView } from "@/components/charges-list-view";

export const Route = createFileRoute("/_authenticated/charges/")({
  component: ChargesPage,
});

function ChargesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">Начисления</h1>
      <ChargesListView />
    </div>
  );
}
