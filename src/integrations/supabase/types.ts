export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      charge_items: {
        Row: {
          amount: number
          charge_id: string
          created_at: string
          description: string | null
          id: string
          kind: string
          owner_id: string
        }
        Insert: {
          amount?: number
          charge_id: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          owner_id: string
        }
        Update: {
          amount?: number
          charge_id?: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charge_items_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          contract_id: string
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          owner_id: string
          paid_total: number
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["charge_status"]
          total: number
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          owner_id: string
          paid_total?: number
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["charge_status"]
          total?: number
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          owner_id?: string
          paid_total?: number
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["charge_status"]
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charges_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          area: number | null
          cadastral_no: string | null
          created_at: string
          currency: string
          deposit_amount: number | null
          deposit_percent: number | null
          end_date: string | null
          id: string
          notes: string | null
          number: string
          owner_id: string
          payment_period: Database["public"]["Enums"]["payment_period"]
          property_id: string
          rate: number
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          tenant_id: string
          termination_terms: string | null
          updated_at: string
        }
        Insert: {
          area?: number | null
          cadastral_no?: string | null
          created_at?: string
          currency?: string
          deposit_amount?: number | null
          deposit_percent?: number | null
          end_date?: string | null
          id?: string
          notes?: string | null
          number: string
          owner_id: string
          payment_period?: Database["public"]["Enums"]["payment_period"]
          property_id: string
          rate?: number
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"]
          tenant_id: string
          termination_terms?: string | null
          updated_at?: string
        }
        Update: {
          area?: number | null
          cadastral_no?: string | null
          created_at?: string
          currency?: string
          deposit_amount?: number | null
          deposit_percent?: number | null
          end_date?: string | null
          id?: string
          notes?: string | null
          number?: string
          owner_id?: string
          payment_period?: Database["public"]["Enums"]["payment_period"]
          property_id?: string
          rate?: number
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          tenant_id?: string
          termination_terms?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          id: string
          label: string | null
          mime_type: string | null
          owner_id: string
          owner_kind: Database["public"]["Enums"]["document_owner_kind"]
          ref_id: string
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          mime_type?: string | null
          owner_id: string
          owner_kind: Database["public"]["Enums"]["document_owner_kind"]
          ref_id: string
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          mime_type?: string | null
          owner_id?: string
          owner_kind?: Database["public"]["Enums"]["document_owner_kind"]
          ref_id?: string
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: []
      }
      folders: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          parent_id: string | null
          plan_mime: string | null
          plan_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          parent_id?: string | null
          plan_mime?: string | null
          plan_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          parent_id?: string | null
          plan_mime?: string | null
          plan_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          charge_id: string
          comment: string | null
          created_at: string
          id: string
          method: string | null
          owner_id: string
          paid_at: string
        }
        Insert: {
          amount: number
          charge_id: string
          comment?: string | null
          created_at?: string
          id?: string
          method?: string | null
          owner_id: string
          paid_at?: string
        }
        Update: {
          amount?: number
          charge_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          method?: string | null
          owner_id?: string
          paid_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string
          area_total: number
          area_usable: number | null
          base_rate: number | null
          cadastral_no: string | null
          created_at: string
          currency: string
          description: string | null
          floor: string | null
          folder_id: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string
          plan_mime: string | null
          plan_path: string | null
          room_no: string | null
          status: Database["public"]["Enums"]["property_status"]
          type: Database["public"]["Enums"]["property_type"]
          updated_at: string
        }
        Insert: {
          address: string
          area_total?: number
          area_usable?: number | null
          base_rate?: number | null
          cadastral_no?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          floor?: string | null
          folder_id?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          plan_mime?: string | null
          plan_path?: string | null
          room_no?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          type?: Database["public"]["Enums"]["property_type"]
          updated_at?: string
        }
        Update: {
          address?: string
          area_total?: number
          area_usable?: number | null
          base_rate?: number | null
          cadastral_no?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          floor?: string | null
          folder_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          plan_mime?: string | null
          plan_path?: string | null
          room_no?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          type?: Database["public"]["Enums"]["property_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      property_markings: {
        Row: {
          color: string | null
          coords: Json
          created_at: string
          folder_id: string
          id: string
          owner_id: string
          property_id: string
          shape: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          coords: Json
          created_at?: string
          folder_id: string
          id?: string
          owner_id: string
          property_id: string
          shape: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          coords?: Json
          created_at?: string
          folder_id?: string
          id?: string
          owner_id?: string
          property_id?: string
          shape?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_markings_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_markings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          inn: string | null
          kind: Database["public"]["Enums"]["tenant_kind"]
          name: string
          notes: string | null
          owner_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          inn?: string | null
          kind?: Database["public"]["Enums"]["tenant_kind"]
          name: string
          notes?: string | null
          owner_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          inn?: string | null
          kind?: Database["public"]["Enums"]["tenant_kind"]
          name?: string
          notes?: string | null
          owner_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recalc_charge: { Args: { _charge_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "owner" | "manager"
      charge_status: "unpaid" | "partial" | "paid" | "overdue"
      contract_status: "draft" | "active" | "finished" | "terminated"
      document_owner_kind: "property" | "tenant" | "contract"
      payment_period: "monthly" | "quarterly" | "yearly" | "one_time"
      property_status:
        | "free"
        | "occupied"
        | "partial"
        | "maintenance"
        | "archived"
      property_type:
        | "office"
        | "warehouse"
        | "retail"
        | "production"
        | "coworking"
        | "other"
      tenant_kind: "person" | "company"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "manager"],
      charge_status: ["unpaid", "partial", "paid", "overdue"],
      contract_status: ["draft", "active", "finished", "terminated"],
      document_owner_kind: ["property", "tenant", "contract"],
      payment_period: ["monthly", "quarterly", "yearly", "one_time"],
      property_status: [
        "free",
        "occupied",
        "partial",
        "maintenance",
        "archived",
      ],
      property_type: [
        "office",
        "warehouse",
        "retail",
        "production",
        "coworking",
        "other",
      ],
      tenant_kind: ["person", "company"],
    },
  },
} as const
