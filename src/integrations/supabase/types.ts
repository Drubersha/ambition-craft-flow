export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      activity_logs: {
        Row: {
          acted_as_user_id: string | null;
          action: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          metadata: Json;
          route: string | null;
          user_id: string | null;
        };
        Insert: {
          acted_as_user_id?: string | null;
          action: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json;
          route?: string | null;
          user_id?: string | null;
        };
        Update: {
          acted_as_user_id?: string | null;
          action?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json;
          route?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      budget_categories: {
        Row: {
          created_at: string;
          id: string;
          limit_amount: number;
          name: string;
          owner_id: string;
          plan_id: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          limit_amount?: number;
          name: string;
          owner_id: string;
          plan_id: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          limit_amount?: number;
          name?: string;
          owner_id?: string;
          plan_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budget_categories_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "budget_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      budget_expenses: {
        Row: {
          amount: number;
          archived: boolean;
          category_id: string;
          created_at: string;
          id: string;
          note: string | null;
          owner_id: string;
          period_end: string;
          period_start: string;
          plan_id: string;
          spent_at: string;
        };
        Insert: {
          amount?: number;
          archived?: boolean;
          category_id: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          owner_id: string;
          period_end: string;
          period_start: string;
          plan_id: string;
          spent_at?: string;
        };
        Update: {
          amount?: number;
          archived?: boolean;
          category_id?: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          owner_id?: string;
          period_end?: string;
          period_start?: string;
          plan_id?: string;
          spent_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budget_expenses_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "budget_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budget_expenses_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "budget_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      budget_period_limits: {
        Row: {
          category_id: string;
          created_at: string;
          id: string;
          limit_amount: number;
          owner_id: string;
          period_start: string;
          plan_id: string;
          updated_at: string;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          id?: string;
          limit_amount?: number;
          owner_id: string;
          period_start: string;
          plan_id: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          id?: string;
          limit_amount?: number;
          owner_id?: string;
          period_start?: string;
          plan_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budget_period_limits_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "budget_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budget_period_limits_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "budget_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      budget_plans: {
        Row: {
          created_at: string;
          currency: string;
          folder_id: string;
          id: string;
          owner_id: string;
          reset_day: number;
          updated_at: string;
          warning_percent: number;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          folder_id: string;
          id?: string;
          owner_id: string;
          reset_day?: number;
          updated_at?: string;
          warning_percent?: number;
        };
        Update: {
          created_at?: string;
          currency?: string;
          folder_id?: string;
          id?: string;
          owner_id?: string;
          reset_day?: number;
          updated_at?: string;
          warning_percent?: number;
        };
        Relationships: [
          {
            foreignKeyName: "budget_plans_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: true;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      charge_items: {
        Row: {
          amount: number;
          charge_id: string;
          created_at: string;
          description: string | null;
          id: string;
          kind: string;
          owner_id: string;
        };
        Insert: {
          amount?: number;
          charge_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          kind?: string;
          owner_id: string;
        };
        Update: {
          amount?: number;
          charge_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          kind?: string;
          owner_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "charge_items_charge_id_fkey";
            columns: ["charge_id"];
            isOneToOne: false;
            referencedRelation: "charges";
            referencedColumns: ["id"];
          },
        ];
      };
      charges: {
        Row: {
          contract_id: string;
          created_at: string;
          due_date: string | null;
          id: string;
          notes: string | null;
          owner_id: string;
          paid_total: number;
          period_end: string;
          period_start: string;
          status: Database["public"]["Enums"]["charge_status"];
          total: number;
          updated_at: string;
        };
        Insert: {
          contract_id: string;
          created_at?: string;
          due_date?: string | null;
          id?: string;
          notes?: string | null;
          owner_id: string;
          paid_total?: number;
          period_end: string;
          period_start: string;
          status?: Database["public"]["Enums"]["charge_status"];
          total?: number;
          updated_at?: string;
        };
        Update: {
          contract_id?: string;
          created_at?: string;
          due_date?: string | null;
          id?: string;
          notes?: string | null;
          owner_id?: string;
          paid_total?: number;
          period_end?: string;
          period_start?: string;
          status?: Database["public"]["Enums"]["charge_status"];
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "charges_contract_id_fkey";
            columns: ["contract_id"];
            isOneToOne: false;
            referencedRelation: "contracts";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_attachments: {
        Row: {
          created_at: string;
          file_name: string;
          id: string;
          message_id: string;
          mime: string | null;
          owner_id: string;
          size_bytes: number | null;
          storage_path: string;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          id?: string;
          message_id: string;
          mime?: string | null;
          owner_id: string;
          size_bytes?: number | null;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          id?: string;
          message_id?: string;
          mime?: string | null;
          owner_id?: string;
          size_bytes?: number | null;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_attachments_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "chat_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_messages: {
        Row: {
          analyzed_at: string | null;
          body: string | null;
          created_at: string;
          id: string;
          owner_id: string;
          read_at: string | null;
          sender_label: string | null;
          sender_role: Database["public"]["Enums"]["chat_sender_role"];
          thread_id: string;
        };
        Insert: {
          analyzed_at?: string | null;
          body?: string | null;
          created_at?: string;
          id?: string;
          owner_id: string;
          read_at?: string | null;
          sender_label?: string | null;
          sender_role: Database["public"]["Enums"]["chat_sender_role"];
          thread_id: string;
        };
        Update: {
          analyzed_at?: string | null;
          body?: string | null;
          created_at?: string;
          id?: string;
          owner_id?: string;
          read_at?: string | null;
          sender_label?: string | null;
          sender_role?: Database["public"]["Enums"]["chat_sender_role"];
          thread_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "chat_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_threads: {
        Row: {
          created_at: string;
          id: string;
          last_message_at: string | null;
          last_message_preview: string | null;
          owner_id: string;
          tenant_id: string;
          unread_owner: number;
          unread_tenant: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          last_message_preview?: string | null;
          owner_id: string;
          tenant_id: string;
          unread_owner?: number;
          unread_tenant?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          last_message_preview?: string | null;
          owner_id?: string;
          tenant_id?: string;
          unread_owner?: number;
          unread_tenant?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_threads_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      contracts: {
        Row: {
          area: number | null;
          cadastral_no: string | null;
          created_at: string;
          currency: string;
          deposit_amount: number | null;
          deposit_percent: number | null;
          end_date: string | null;
          id: string;
          kind: Database["public"]["Enums"]["contract_kind"];
          notes: string | null;
          number: string | null;
          owner_id: string;
          payment_period: Database["public"]["Enums"]["payment_period"];
          property_id: string;
          rate: number;
          start_date: string;
          status: Database["public"]["Enums"]["contract_status"];
          tenant_id: string;
          termination_terms: string | null;
          updated_at: string;
        };
        Insert: {
          area?: number | null;
          cadastral_no?: string | null;
          created_at?: string;
          currency?: string;
          deposit_amount?: number | null;
          deposit_percent?: number | null;
          end_date?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["contract_kind"];
          notes?: string | null;
          number?: string | null;
          owner_id: string;
          payment_period?: Database["public"]["Enums"]["payment_period"];
          property_id: string;
          rate?: number;
          start_date: string;
          status?: Database["public"]["Enums"]["contract_status"];
          tenant_id: string;
          termination_terms?: string | null;
          updated_at?: string;
        };
        Update: {
          area?: number | null;
          cadastral_no?: string | null;
          created_at?: string;
          currency?: string;
          deposit_amount?: number | null;
          deposit_percent?: number | null;
          end_date?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["contract_kind"];
          notes?: string | null;
          number?: string | null;
          owner_id?: string;
          payment_period?: Database["public"]["Enums"]["payment_period"];
          property_id?: string;
          rate?: number;
          start_date?: string;
          status?: Database["public"]["Enums"]["contract_status"];
          tenant_id?: string;
          termination_terms?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contracts_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contracts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          created_at: string;
          id: string;
          label: string | null;
          mime_type: string | null;
          owner_id: string;
          owner_kind: Database["public"]["Enums"]["document_owner_kind"];
          ref_id: string;
          size_bytes: number | null;
          storage_path: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          label?: string | null;
          mime_type?: string | null;
          owner_id: string;
          owner_kind: Database["public"]["Enums"]["document_owner_kind"];
          ref_id: string;
          size_bytes?: number | null;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          label?: string | null;
          mime_type?: string | null;
          owner_id?: string;
          owner_kind?: Database["public"]["Enums"]["document_owner_kind"];
          ref_id?: string;
          size_bytes?: number | null;
          storage_path?: string;
        };
        Relationships: [];
      };
      folders: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          parent_id: string | null;
          plan_mime: string | null;
          plan_path: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          parent_id?: string | null;
          plan_mime?: string | null;
          plan_path?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          parent_id?: string | null;
          plan_mime?: string | null;
          plan_path?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "folders_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_events: {
        Row: {
          comment: string | null;
          created_at: string;
          from_stage: Database["public"]["Enums"]["lead_stage"] | null;
          id: string;
          lead_id: string;
          owner_id: string;
          passed: boolean;
          to_stage: Database["public"]["Enums"]["lead_stage"] | null;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          from_stage?: Database["public"]["Enums"]["lead_stage"] | null;
          id?: string;
          lead_id: string;
          owner_id: string;
          passed: boolean;
          to_stage?: Database["public"]["Enums"]["lead_stage"] | null;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          from_stage?: Database["public"]["Enums"]["lead_stage"] | null;
          id?: string;
          lead_id?: string;
          owner_id?: string;
          passed?: boolean;
          to_stage?: Database["public"]["Enums"]["lead_stage"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          archived_at: string | null;
          archived_reason: string | null;
          budget: number | null;
          contract_id: string | null;
          created_at: string;
          desired_area: number | null;
          email: string | null;
          full_name: string;
          id: string;
          inn: string | null;
          notes: string | null;
          owner_id: string;
          phone: string | null;
          property_id: string;
          source: Database["public"]["Enums"]["lead_source"];
          stage: Database["public"]["Enums"]["lead_stage"];
          status: Database["public"]["Enums"]["lead_status"];
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          archived_reason?: string | null;
          budget?: number | null;
          contract_id?: string | null;
          created_at?: string;
          desired_area?: number | null;
          email?: string | null;
          full_name: string;
          id?: string;
          inn?: string | null;
          notes?: string | null;
          owner_id: string;
          phone?: string | null;
          property_id: string;
          source?: Database["public"]["Enums"]["lead_source"];
          stage?: Database["public"]["Enums"]["lead_stage"];
          status?: Database["public"]["Enums"]["lead_status"];
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          archived_reason?: string | null;
          budget?: number | null;
          contract_id?: string | null;
          created_at?: string;
          desired_area?: number | null;
          email?: string | null;
          full_name?: string;
          id?: string;
          inn?: string | null;
          notes?: string | null;
          owner_id?: string;
          phone?: string | null;
          property_id?: string;
          source?: Database["public"]["Enums"]["lead_source"];
          stage?: Database["public"]["Enums"]["lead_stage"];
          status?: Database["public"]["Enums"]["lead_status"];
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leads_contract_id_fkey";
            columns: ["contract_id"];
            isOneToOne: false;
            referencedRelation: "contracts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      meter_readings: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          meter_id: string;
          note: string | null;
          owner_id: string;
          read_at: string;
          reading: number;
          source: Database["public"]["Enums"]["meter_reading_source"];
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          meter_id: string;
          note?: string | null;
          owner_id: string;
          read_at?: string;
          reading: number;
          source?: Database["public"]["Enums"]["meter_reading_source"];
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          meter_id?: string;
          note?: string | null;
          owner_id?: string;
          read_at?: string;
          reading?: number;
          source?: Database["public"]["Enums"]["meter_reading_source"];
        };
        Relationships: [
          {
            foreignKeyName: "meter_readings_meter_id_fkey";
            columns: ["meter_id"];
            isOneToOne: false;
            referencedRelation: "meters";
            referencedColumns: ["id"];
          },
        ];
      };
      meters: {
        Row: {
          active: boolean;
          contract_id: string | null;
          created_at: string;
          folder_id: string | null;
          id: string;
          notes: string | null;
          owner_id: string;
          property_id: string | null;
          serial_no: string;
          start_value: number;
          type: Database["public"]["Enums"]["meter_type"];
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          contract_id?: string | null;
          created_at?: string;
          folder_id?: string | null;
          id?: string;
          notes?: string | null;
          owner_id: string;
          property_id?: string | null;
          serial_no: string;
          start_value?: number;
          type?: Database["public"]["Enums"]["meter_type"];
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          contract_id?: string | null;
          created_at?: string;
          folder_id?: string | null;
          id?: string;
          notes?: string | null;
          owner_id?: string;
          property_id?: string | null;
          serial_no?: string;
          start_value?: number;
          type?: Database["public"]["Enums"]["meter_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meters_contract_id_fkey";
            columns: ["contract_id"];
            isOneToOne: false;
            referencedRelation: "contracts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meters_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meters_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          emailed_at: string | null;
          entity_id: string | null;
          entity_table: string | null;
          id: string;
          kind: string;
          read_at: string | null;
          route: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          emailed_at?: string | null;
          entity_id?: string | null;
          entity_table?: string | null;
          id?: string;
          kind: string;
          read_at?: string | null;
          route?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          emailed_at?: string | null;
          entity_id?: string | null;
          entity_table?: string | null;
          id?: string;
          kind?: string;
          read_at?: string | null;
          route?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          amount: number;
          charge_id: string;
          comment: string | null;
          created_at: string;
          id: string;
          method: string | null;
          owner_id: string;
          paid_at: string;
        };
        Insert: {
          amount: number;
          charge_id: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          method?: string | null;
          owner_id: string;
          paid_at?: string;
        };
        Update: {
          amount?: number;
          charge_id?: string;
          comment?: string | null;
          created_at?: string;
          id?: string;
          method?: string | null;
          owner_id?: string;
          paid_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_charge_id_fkey";
            columns: ["charge_id"];
            isOneToOne: false;
            referencedRelation: "charges";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string | null;
          id: string;
          onboarding: Json;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          full_name?: string | null;
          id: string;
          onboarding?: Json;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string | null;
          id?: string;
          onboarding?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      properties: {
        Row: {
          address: string;
          area_total: number;
          area_usable: number | null;
          base_rate: number | null;
          cadastral_no: string | null;
          created_at: string;
          currency: string;
          description: string | null;
          floor: string | null;
          folder_id: string | null;
          id: string;
          name: string;
          notes: string | null;
          owner_id: string;
          plan_mime: string | null;
          plan_path: string | null;
          room_no: string | null;
          status: Database["public"]["Enums"]["property_status"];
          type: Database["public"]["Enums"]["property_type"];
          updated_at: string;
        };
        Insert: {
          address: string;
          area_total?: number;
          area_usable?: number | null;
          base_rate?: number | null;
          cadastral_no?: string | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          floor?: string | null;
          folder_id?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          owner_id: string;
          plan_mime?: string | null;
          plan_path?: string | null;
          room_no?: string | null;
          status?: Database["public"]["Enums"]["property_status"];
          type?: Database["public"]["Enums"]["property_type"];
          updated_at?: string;
        };
        Update: {
          address?: string;
          area_total?: number;
          area_usable?: number | null;
          base_rate?: number | null;
          cadastral_no?: string | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          floor?: string | null;
          folder_id?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          owner_id?: string;
          plan_mime?: string | null;
          plan_path?: string | null;
          room_no?: string | null;
          status?: Database["public"]["Enums"]["property_status"];
          type?: Database["public"]["Enums"]["property_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "properties_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      property_markings: {
        Row: {
          color: string | null;
          coords: Json;
          created_at: string;
          folder_id: string;
          id: string;
          owner_id: string;
          property_id: string;
          shape: string;
          updated_at: string;
        };
        Insert: {
          color?: string | null;
          coords: Json;
          created_at?: string;
          folder_id: string;
          id?: string;
          owner_id: string;
          property_id: string;
          shape: string;
          updated_at?: string;
        };
        Update: {
          color?: string | null;
          coords?: Json;
          created_at?: string;
          folder_id?: string;
          id?: string;
          owner_id?: string;
          property_id?: string;
          shape?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "property_markings_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "property_markings_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };
      task_suggestions: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          model: string | null;
          owner_id: string;
          photo_paths: string[];
          priority: Database["public"]["Enums"]["task_priority"];
          source_message_id: string | null;
          status: Database["public"]["Enums"]["task_suggestion_status"];
          tenant_id: string | null;
          thread_id: string | null;
          title: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          model?: string | null;
          owner_id: string;
          photo_paths?: string[];
          priority?: Database["public"]["Enums"]["task_priority"];
          source_message_id?: string | null;
          status?: Database["public"]["Enums"]["task_suggestion_status"];
          tenant_id?: string | null;
          thread_id?: string | null;
          title: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          model?: string | null;
          owner_id?: string;
          photo_paths?: string[];
          priority?: Database["public"]["Enums"]["task_priority"];
          source_message_id?: string | null;
          status?: Database["public"]["Enums"]["task_suggestion_status"];
          tenant_id?: string | null;
          thread_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_suggestions_source_message_id_fkey";
            columns: ["source_message_id"];
            isOneToOne: false;
            referencedRelation: "chat_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_suggestions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_suggestions_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "chat_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          owner_id: string;
          photo_paths: string[];
          position: number;
          priority: Database["public"]["Enums"]["task_priority"];
          source_message_id: string | null;
          status: Database["public"]["Enums"]["task_status"];
          tenant_id: string | null;
          thread_id: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          owner_id: string;
          photo_paths?: string[];
          position?: number;
          priority?: Database["public"]["Enums"]["task_priority"];
          source_message_id?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          tenant_id?: string | null;
          thread_id?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          owner_id?: string;
          photo_paths?: string[];
          position?: number;
          priority?: Database["public"]["Enums"]["task_priority"];
          source_message_id?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          tenant_id?: string | null;
          thread_id?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_source_message_id_fkey";
            columns: ["source_message_id"];
            isOneToOne: false;
            referencedRelation: "chat_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "chat_threads";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_contacts: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          owner_id: string;
          phone: string | null;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          owner_id: string;
          phone?: string | null;
          sort_order?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          owner_id?: string;
          phone?: string | null;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_contacts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          contact_person: string | null;
          created_at: string;
          email: string | null;
          id: string;
          inn: string | null;
          kind: Database["public"]["Enums"]["tenant_kind"];
          name: string;
          notes: string | null;
          owner_id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          contact_person?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          inn?: string | null;
          kind?: Database["public"]["Enums"]["tenant_kind"];
          name: string;
          notes?: string | null;
          owner_id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          contact_person?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          inn?: string | null;
          kind?: Database["public"]["Enums"]["tenant_kind"];
          name?: string;
          notes?: string | null;
          owner_id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_links: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          member_user_id: string;
          owner_user_id: string;
          role: Database["public"]["Enums"]["app_role"];
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          member_user_id: string;
          owner_user_id: string;
          role: Database["public"]["Enums"]["app_role"];
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          member_user_id?: string;
          owner_user_id?: string;
          role?: Database["public"]["Enums"]["app_role"];
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      utility_allocations: {
        Row: {
          amount: number;
          charge_id: string | null;
          consumption: number | null;
          contract_id: string;
          created_at: string;
          id: string;
          meter_id: string | null;
          method: string;
          owner_id: string;
          period_id: string;
        };
        Insert: {
          amount?: number;
          charge_id?: string | null;
          consumption?: number | null;
          contract_id: string;
          created_at?: string;
          id?: string;
          meter_id?: string | null;
          method?: string;
          owner_id: string;
          period_id: string;
        };
        Update: {
          amount?: number;
          charge_id?: string | null;
          consumption?: number | null;
          contract_id?: string;
          created_at?: string;
          id?: string;
          meter_id?: string | null;
          method?: string;
          owner_id?: string;
          period_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "utility_allocations_charge_id_fkey";
            columns: ["charge_id"];
            isOneToOne: false;
            referencedRelation: "charges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "utility_allocations_contract_id_fkey";
            columns: ["contract_id"];
            isOneToOne: false;
            referencedRelation: "contracts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "utility_allocations_meter_id_fkey";
            columns: ["meter_id"];
            isOneToOne: false;
            referencedRelation: "meters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "utility_allocations_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: false;
            referencedRelation: "utility_periods";
            referencedColumns: ["id"];
          },
        ];
      };
      utility_periods: {
        Row: {
          created_at: string;
          currency: string;
          expense_id: string | null;
          folder_id: string;
          id: string;
          notes: string | null;
          owner_id: string;
          period_end: string;
          period_start: string;
          service: Database["public"]["Enums"]["meter_type"];
          status: Database["public"]["Enums"]["utility_period_status"];
          total_amount: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          expense_id?: string | null;
          folder_id: string;
          id?: string;
          notes?: string | null;
          owner_id: string;
          period_end: string;
          period_start: string;
          service: Database["public"]["Enums"]["meter_type"];
          status?: Database["public"]["Enums"]["utility_period_status"];
          total_amount?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          expense_id?: string | null;
          folder_id?: string;
          id?: string;
          notes?: string | null;
          owner_id?: string;
          period_end?: string;
          period_start?: string;
          service?: Database["public"]["Enums"]["meter_type"];
          status?: Database["public"]["Enums"]["utility_period_status"];
          total_amount?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "utility_periods_expense_id_fkey";
            columns: ["expense_id"];
            isOneToOne: false;
            referencedRelation: "budget_expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "utility_periods_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _is_non_prod_env: { Args: never; Returns: boolean };
      _notify_owner_and_managers: {
        Args: {
          _body: string;
          _entity_id: string;
          _entity_table: string;
          _kind: string;
          _owner_id: string;
          _route: string;
          _title: string;
        };
        Returns: undefined;
      };
      _seed_demo_user: {
        Args: {
          _email: string;
          _full_name: string;
          _password: string;
          _roles: Database["public"]["Enums"]["app_role"][];
        };
        Returns: string;
      };
      get_my_owner_ids: {
        Args: { _role: Database["public"]["Enums"]["app_role"] };
        Returns: string[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_admin: { Args: { _user_id: string }; Returns: boolean };
      is_linked_member: {
        Args: {
          _member: string;
          _owner: string;
          _role: Database["public"]["Enums"]["app_role"];
        };
        Returns: boolean;
      };
      my_chat_role: { Args: { _thread: string }; Returns: string };
      recalc_charge: { Args: { _charge_id: string }; Returns: undefined };
      recalc_property_status: {
        Args: { _property_id: string };
        Returns: undefined;
      };
      tenant_can_access_document: {
        Args: { _doc_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "owner" | "manager" | "developer" | "moderator" | "tenant";
      charge_status: "unpaid" | "partial" | "paid" | "overdue";
      chat_sender_role: "owner" | "manager" | "tenant";
      contract_kind: "rent" | "ahch";
      contract_status: "draft" | "active" | "finished" | "terminated";
      document_owner_kind: "property" | "tenant" | "contract";
      lead_source: "avito" | "cian" | "yandex" | "referral" | "website" | "other";
      lead_stage: "inquiry" | "viewing" | "documents" | "contract_sent" | "signed";
      lead_status: "active" | "archived" | "won";
      meter_reading_source: "tenant" | "owner";
      meter_type: "electricity" | "water_cold" | "water_hot" | "gas" | "heat";
      payment_period: "monthly" | "quarterly" | "yearly" | "one_time";
      property_status:
        "free" | "occupied" | "partial" | "maintenance" | "archived" | "ahch" | "partial_ahch";
      property_type:
        | "office"
        | "warehouse"
        | "retail"
        | "production"
        | "coworking"
        | "land"
        | "parking"
        | "other";
      task_priority: "low" | "normal" | "high";
      task_status: "accepted" | "in_progress" | "review" | "done" | "archived";
      task_suggestion_status: "pending" | "accepted" | "dismissed";
      tenant_kind: "person" | "company" | "own_company" | "owner_friends";
      utility_period_status: "draft" | "allocated";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "manager", "developer", "moderator", "tenant"],
      charge_status: ["unpaid", "partial", "paid", "overdue"],
      chat_sender_role: ["owner", "manager", "tenant"],
      contract_kind: ["rent", "ahch"],
      contract_status: ["draft", "active", "finished", "terminated"],
      document_owner_kind: ["property", "tenant", "contract"],
      lead_source: ["avito", "cian", "yandex", "referral", "website", "other"],
      lead_stage: ["inquiry", "viewing", "documents", "contract_sent", "signed"],
      lead_status: ["active", "archived", "won"],
      meter_reading_source: ["tenant", "owner"],
      meter_type: ["electricity", "water_cold", "water_hot", "gas", "heat"],
      payment_period: ["monthly", "quarterly", "yearly", "one_time"],
      property_status: [
        "free",
        "occupied",
        "partial",
        "maintenance",
        "archived",
        "ahch",
        "partial_ahch",
      ],
      property_type: [
        "office",
        "warehouse",
        "retail",
        "production",
        "coworking",
        "land",
        "parking",
        "other",
      ],
      task_priority: ["low", "normal", "high"],
      task_status: ["accepted", "in_progress", "review", "done", "archived"],
      task_suggestion_status: ["pending", "accepted", "dismissed"],
      tenant_kind: ["person", "company", "own_company", "owner_friends"],
      utility_period_status: ["draft", "allocated"],
    },
  },
} as const;
