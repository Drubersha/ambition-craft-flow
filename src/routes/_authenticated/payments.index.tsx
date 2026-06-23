import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChargesListView } from "@/components/charges-list-view";
import { PaymentsListView } from "@/components/payments-list-view";

export const Route = createFileRoute("/_authenticated/payments/")({
  component: PaymentsPage,
});

function PaymentsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">Оплаты</h1>
      <Tabs defaultValue="charges">
        <TabsList>
          <TabsTrigger value="charges">Начисления</TabsTrigger>
          <TabsTrigger value="payments">Платежи</TabsTrigger>
        </TabsList>
        <TabsContent value="charges" className="mt-4">
          <ChargesListView />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentsListView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
