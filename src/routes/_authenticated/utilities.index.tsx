import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { MetersTab } from "@/components/utilities/meters-tab";
import { PeriodsTab } from "@/components/utilities/periods-tab";
import { AnalyticsTab } from "@/components/utilities/analytics-tab";
import type { Meter, MeterReading } from "@/lib/meters";

export const Route = createFileRoute("/_authenticated/utilities/")({
  component: UtilitiesPage,
});

/** Раздел «Коммуналка»: загрузка данных, фильтр по папке и вкладки. */
function UtilitiesPage() {
  const [folderId, setFolderId] = useState<string>("");

  const { data: folders } = useQuery({
    queryKey: ["folders-list"],
    queryFn: async () =>
      (await supabase.from("folders").select("id,name").order("name")).data ?? [],
  });
  const { data: properties } = useQuery({
    queryKey: ["properties-list-utilities"],
    queryFn: async () =>
      (await supabase.from("properties").select("id,name,folder_id").order("name")).data ?? [],
  });
  const { data: contracts } = useQuery({
    queryKey: ["contracts-list-utilities"],
    queryFn: async () =>
      (
        await supabase
          .from("contracts")
          .select("id,number,property_id,area,start_date,end_date,status,tenant:tenants(id,name)")
          .order("start_date", { ascending: false })
      ).data ?? [],
  });
  const { data: meters } = useQuery({
    queryKey: ["meters"],
    queryFn: async () =>
      ((await supabase.from("meters").select("*").eq("active", true).order("created_at")).data ??
        []) as Meter[],
  });
  const meterIds = (meters ?? []).map((m) => m.id);
  const { data: readings } = useQuery({
    queryKey: ["meter-readings", meterIds.join(",")],
    enabled: meterIds.length > 0,
    queryFn: async () =>
      ((
        await supabase
          .from("meter_readings")
          .select("id, meter_id, reading, read_at, source")
          .in("meter_id", meterIds)
          .order("read_at")
      ).data ?? []) as MeterReading[],
  });

  const propertyById = useMemo(
    () => new Map((properties ?? []).map((p) => [p.id, p])),
    [properties],
  );
  const contractById = useMemo(() => new Map((contracts ?? []).map((c) => [c.id, c])), [contracts]);

  // Фильтр по папке: счётчик попадает в папку напрямую (общий) или через объект.
  const visibleMeters = (meters ?? []).filter((m) => {
    if (!folderId) return true;
    if (m.folder_id) return m.folder_id === folderId;
    const p = m.property_id ? propertyById.get(m.property_id) : null;
    return p?.folder_id === folderId;
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Коммуналка"
        description="Счётчики, показания и компенсация коммунальных услуг с арендаторов"
      />
      <div className="max-w-xs">
        <Select value={folderId || "all"} onValueChange={(v) => setFolderId(v === "all" ? "" : v)}>
          <SelectTrigger aria-label="Фильтр по папке">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все папки</SelectItem>
            {folders?.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Tabs defaultValue="meters">
        <TabsList>
          <TabsTrigger value="meters">Счётчики</TabsTrigger>
          <TabsTrigger value="periods">Компенсация</TabsTrigger>
          <TabsTrigger value="analytics">Аналитика</TabsTrigger>
        </TabsList>
        <TabsContent value="meters" className="space-y-3 pt-3">
          <MetersTab
            meters={visibleMeters}
            readings={readings ?? []}
            folders={folders ?? []}
            properties={properties ?? []}
            contracts={contracts ?? []}
            propertyById={propertyById}
            contractById={contractById}
          />
        </TabsContent>
        <TabsContent value="periods" className="space-y-3 pt-3">
          <PeriodsTab
            folderId={folderId}
            folders={folders ?? []}
            meters={meters ?? []}
            readings={readings ?? []}
            contracts={contracts ?? []}
            propertyById={propertyById}
          />
        </TabsContent>
        <TabsContent value="analytics" className="space-y-3 pt-3">
          <AnalyticsTab
            folderId={folderId}
            folders={folders ?? []}
            meters={visibleMeters}
            readings={readings ?? []}
            contractById={contractById}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
