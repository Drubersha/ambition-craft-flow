import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MarkingShape = "polygon" | "circle" | "point";

export type PolygonCoords = { points: [number, number][] };
export type CircleCoords = { cx: number; cy: number; r: number };
export type PointCoords = { cx: number; cy: number };
export type MarkingCoords = PolygonCoords | CircleCoords | PointCoords;

export type Marking = {
  id: string;
  owner_id: string;
  property_id: string;
  folder_id: string;
  shape: MarkingShape;
  coords: MarkingCoords;
  color: string | null;
  created_at: string;
  updated_at: string;
};

export function useFolderMarkings(folderId: string | null | undefined) {
  return useQuery({
    queryKey: ["folder-markings", folderId],
    enabled: !!folderId,
    queryFn: async (): Promise<Marking[]> => {
      const { data, error } = await supabase
        .from("property_markings")
        .select("*")
        .eq("folder_id", folderId!);
      if (error) throw error;
      return (data ?? []) as unknown as Marking[];
    },
  });
}

/** Properties visible on this folder's plan = props in folder + all descendants. */
export function useFolderPlanProperties(folderId: string | null | undefined, allFolderIds: string[]) {
  return useQuery({
    queryKey: ["folder-plan-properties", folderId, allFolderIds.join(",")],
    enabled: !!folderId && allFolderIds.length > 0,
    queryFn: async () => {
      const { data: props, error } = await supabase
        .from("properties")
        .select("id,name,address,area_total,base_rate,currency,folder_id")
        .in("folder_id", allFolderIds)
        .order("name");
      if (error) throw error;
      const ids = (props ?? []).map((p) => p.id);
      if (ids.length === 0) return { properties: props ?? [], activeContracts: {} as Record<string, any> };
      const { data: contracts, error: e2 } = await supabase
        .from("contracts")
        .select("id,property_id,rate,currency,payment_period,area,status")
        .in("property_id", ids)
        .eq("status", "active");
      if (e2) throw e2;
      const byProp: Record<string, any> = {};
      for (const c of contracts ?? []) {
        if (!byProp[c.property_id]) byProp[c.property_id] = c;
      }
      return { properties: props ?? [], activeContracts: byProp };
    },
  });
}