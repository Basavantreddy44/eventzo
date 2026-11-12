export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      areas: {
        Row: {
          active: boolean;
          city_id: string;
          created_at: string;
          id: string;
          name: string;
          name_i18n: NonNullable<Json>;
          pincode: string | null;
          slug: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          city_id: string;
          created_at?: string;
          id?: string;
          name: string;
          name_i18n?: NonNullable<Json>;
          pincode?: string | null;
          slug: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          city_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          name_i18n?: NonNullable<Json>;
          pincode?: string | null;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "areas_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_db_role: string;
          actor_user_id: string | null;
          changed_fields: string[] | null;
          entity_id: string | null;
          entity_table: string;
          id: number;
          metadata: NonNullable<Json>;
          new_data: Json | null;
          occurred_at: string;
          old_data: Json | null;
          organization_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_db_role?: string;
          actor_user_id?: string | null;
          changed_fields?: string[] | null;
          entity_id?: string | null;
          entity_table: string;
          id?: never;
          metadata?: NonNullable<Json>;
          new_data?: Json | null;
          occurred_at?: string;
          old_data?: Json | null;
          organization_id?: string | null;
        };
        Update: {
          action?: string;
          actor_db_role?: string;
          actor_user_id?: string | null;
          changed_fields?: string[] | null;
          entity_id?: string | null;
          entity_table?: string;
          id?: never;
          metadata?: NonNullable<Json>;
          new_data?: Json | null;
          occurred_at?: string;
          old_data?: Json | null;
          organization_id?: string | null;
        };
        Relationships: [];
      };
      auspicious_dates: {
        Row: {
          city_id: string | null;
          created_at: string;
          created_by: string | null;
          date: string;
          id: string;
          is_published: boolean;
          muhurtham_windows: NonNullable<Json>;
          notes: string | null;
          significance: number;
          source: string | null;
          title: string;
          title_i18n: NonNullable<Json>;
          tradition: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          city_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          date: string;
          id?: string;
          is_published?: boolean;
          muhurtham_windows?: NonNullable<Json>;
          notes?: string | null;
          significance?: number;
          source?: string | null;
          title: string;
          title_i18n?: NonNullable<Json>;
          tradition?: string;
          updated_at?: string;
        };
        Update: {
          city_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          date?: string;
          id?: string;
          is_published?: boolean;
          muhurtham_windows?: NonNullable<Json>;
          notes?: string | null;
          significance?: number;
          source?: string | null;
          title?: string;
          title_i18n?: NonNullable<Json>;
          tradition?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "auspicious_dates_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "auspicious_dates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bookable_resources: {
        Row: {
          active: boolean;
          allocation_mode: Database["public"]["Enums"]["allocation_mode"];
          branch_id: string | null;
          breakdown_buffer_min: number;
          capacity: number;
          created_at: string;
          created_by: string | null;
          id: string;
          kind: Database["public"]["Enums"]["resource_kind"];
          name: string;
          organization_id: string;
          service_id: string | null;
          setup_buffer_min: number;
          staff_profile_id: string | null;
          travel_buffer_min: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          allocation_mode?: Database["public"]["Enums"]["allocation_mode"];
          branch_id?: string | null;
          breakdown_buffer_min?: number;
          capacity?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["resource_kind"];
          name: string;
          organization_id: string;
          service_id?: string | null;
          setup_buffer_min?: number;
          staff_profile_id?: string | null;
          travel_buffer_min?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          allocation_mode?: Database["public"]["Enums"]["allocation_mode"];
          branch_id?: string | null;
          breakdown_buffer_min?: number;
          capacity?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["resource_kind"];
          name?: string;
          organization_id?: string;
          service_id?: string | null;
          setup_buffer_min?: number;
          staff_profile_id?: string | null;
          travel_buffer_min?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookable_resources_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "bookable_resources_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookable_resources_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookable_resources_staff_profile_fk";
            columns: ["staff_profile_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      booking_items: {
        Row: {
          advance_bps: number;
          advance_paise: number;
          booking_id: string;
          branch_id: string | null;
          cancel_reason: string | null;
          cancellation_policy: Database["public"]["Enums"]["cancellation_policy"];
          cancelled_at: string | null;
          cancelled_by_side: string | null;
          confirmed_at: string | null;
          created_at: string;
          currency: string;
          customer_id: string;
          enquiry_id: string;
          event_date: string;
          guests: number | null;
          id: string;
          organization_id: string;
          paid_paise: number;
          payment_due_at: string;
          period: unknown;
          quotation_id: string | null;
          refund_due_paise: number;
          reservation_id: string | null;
          service_id: string;
          snapshot: NonNullable<Json>;
          status: Database["public"]["Enums"]["booking_item_status"];
          total_paise: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          advance_bps: number;
          advance_paise: number;
          booking_id: string;
          branch_id?: string | null;
          cancel_reason?: string | null;
          cancellation_policy: Database["public"]["Enums"]["cancellation_policy"];
          cancelled_at?: string | null;
          cancelled_by_side?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          currency?: string;
          customer_id: string;
          enquiry_id: string;
          event_date: string;
          guests?: number | null;
          id?: string;
          organization_id: string;
          paid_paise?: number;
          payment_due_at: string;
          period: unknown;
          quotation_id?: string | null;
          refund_due_paise?: number;
          reservation_id?: string | null;
          service_id: string;
          snapshot?: NonNullable<Json>;
          status?: Database["public"]["Enums"]["booking_item_status"];
          total_paise: number;
          updated_at?: string;
        };
        Update: {
          advance_bps?: number;
          advance_paise?: number;
          booking_id?: string;
          branch_id?: string | null;
          cancel_reason?: string | null;
          cancellation_policy?: Database["public"]["Enums"]["cancellation_policy"];
          cancelled_at?: string | null;
          cancelled_by_side?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          currency?: string;
          customer_id?: string;
          enquiry_id?: string;
          event_date?: string;
          guests?: number | null;
          id?: string;
          organization_id?: string;
          paid_paise?: number;
          payment_due_at?: string;
          period?: unknown;
          quotation_id?: string | null;
          refund_due_paise?: number;
          reservation_id?: string | null;
          service_id?: string;
          snapshot?: NonNullable<Json>;
          status?: Database["public"]["Enums"]["booking_item_status"];
          total_paise?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_items_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_items_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_items_enquiry_id_fkey";
            columns: ["enquiry_id"];
            isOneToOne: true;
            referencedRelation: "enquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_items_quotation_id_fkey";
            columns: ["quotation_id"];
            isOneToOne: false;
            referencedRelation: "quotations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_items_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "resource_reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_items_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          created_at: string;
          customer_id: string;
          event_id: string | null;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          customer_id: string;
          event_id?: string | null;
          id?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          event_id?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_event_fk";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      branches: {
        Row: {
          active: boolean;
          address_line1: string | null;
          address_line2: string | null;
          area_id: string | null;
          city_id: string | null;
          created_at: string;
          id: string;
          is_primary: boolean;
          latitude: number | null;
          longitude: number | null;
          name: string;
          organization_id: string;
          phone: string | null;
          pincode: string | null;
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          address_line1?: string | null;
          address_line2?: string | null;
          area_id?: string | null;
          city_id?: string | null;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          organization_id: string;
          phone?: string | null;
          pincode?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          address_line1?: string | null;
          address_line2?: string | null;
          area_id?: string | null;
          city_id?: string | null;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          organization_id?: string;
          phone?: string | null;
          pincode?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branches_area_id_fkey";
            columns: ["area_id"];
            isOneToOne: false;
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branches_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      budget_benchmarks: {
        Row: {
          business_category_id: string;
          city_id: string;
          created_at: string;
          high_paise: number;
          id: string;
          is_published: boolean;
          low_paise: number;
          notes: string | null;
          source: string | null;
          unit: Database["public"]["Enums"]["budget_unit"];
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          business_category_id: string;
          city_id: string;
          created_at?: string;
          high_paise: number;
          id?: string;
          is_published?: boolean;
          low_paise: number;
          notes?: string | null;
          source?: string | null;
          unit: Database["public"]["Enums"]["budget_unit"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          business_category_id?: string;
          city_id?: string;
          created_at?: string;
          high_paise?: number;
          id?: string;
          is_published?: boolean;
          low_paise?: number;
          notes?: string | null;
          source?: string | null;
          unit?: Database["public"]["Enums"]["budget_unit"];
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "budget_benchmarks_business_category_id_fkey";
            columns: ["business_category_id"];
            isOneToOne: false;
            referencedRelation: "business_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budget_benchmarks_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budget_benchmarks_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      business_categories: {
        Row: {
          active: boolean;
          created_at: string;
          description: string | null;
          display_order: number;
          icon: string | null;
          id: string;
          is_launch_focus: boolean;
          name: string;
          name_i18n: NonNullable<Json>;
          slug: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          display_order?: number;
          icon?: string | null;
          id?: string;
          is_launch_focus?: boolean;
          name: string;
          name_i18n?: NonNullable<Json>;
          slug: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          display_order?: number;
          icon?: string | null;
          id?: string;
          is_launch_focus?: boolean;
          name?: string;
          name_i18n?: NonNullable<Json>;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      business_documents: {
        Row: {
          created_at: string;
          document_type: Database["public"]["Enums"]["business_document_type"];
          expires_on: string | null;
          file_name: string;
          id: string;
          mime_type: string;
          organization_id: string;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          size_bytes: number;
          status: Database["public"]["Enums"]["document_status"];
          storage_path: string;
          updated_at: string;
          uploaded_by: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          document_type: Database["public"]["Enums"]["business_document_type"];
          expires_on?: string | null;
          file_name: string;
          id?: string;
          mime_type: string;
          organization_id: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          size_bytes: number;
          status?: Database["public"]["Enums"]["document_status"];
          storage_path: string;
          updated_at?: string;
          uploaded_by: string;
        };
        Update: {
          created_at?: string;
          document_type?: Database["public"]["Enums"]["business_document_type"];
          expires_on?: string | null;
          file_name?: string;
          id?: string;
          mime_type?: string;
          organization_id?: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          size_bytes?: number;
          status?: Database["public"]["Enums"]["document_status"];
          storage_path?: string;
          updated_at?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_documents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_documents_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_documents_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      business_profiles: {
        Row: {
          contact_email: string | null;
          contact_phone: string | null;
          created_at: string;
          description: string | null;
          display_name: string | null;
          gstin: string | null;
          languages: Database["public"]["Enums"]["app_locale"][];
          organization_id: string;
          pan: string | null;
          tagline: string | null;
          updated_at: string;
          website: string | null;
          whatsapp_phone: string | null;
          year_established: number | null;
        };
        ComputedFields: never;
        Insert: {
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          description?: string | null;
          display_name?: string | null;
          gstin?: string | null;
          languages?: Database["public"]["Enums"]["app_locale"][];
          organization_id: string;
          pan?: string | null;
          tagline?: string | null;
          updated_at?: string;
          website?: string | null;
          whatsapp_phone?: string | null;
          year_established?: number | null;
        };
        Update: {
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          description?: string | null;
          display_name?: string | null;
          gstin?: string | null;
          languages?: Database["public"]["Enums"]["app_locale"][];
          organization_id?: string;
          pan?: string | null;
          tagline?: string | null;
          updated_at?: string;
          website?: string | null;
          whatsapp_phone?: string | null;
          year_established?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "business_profiles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      catering_details: {
        Row: {
          cuisines: string[];
          live_counters: boolean | null;
          max_plates: number | null;
          min_plates: number | null;
          nonveg_price_per_plate_paise: number | null;
          organization_id: string;
          service_id: string;
          service_staff_included: boolean | null;
          updated_at: string;
          veg_price_per_plate_paise: number | null;
        };
        ComputedFields: never;
        Insert: {
          cuisines?: string[];
          live_counters?: boolean | null;
          max_plates?: number | null;
          min_plates?: number | null;
          nonveg_price_per_plate_paise?: number | null;
          organization_id: string;
          service_id: string;
          service_staff_included?: boolean | null;
          updated_at?: string;
          veg_price_per_plate_paise?: number | null;
        };
        Update: {
          cuisines?: string[];
          live_counters?: boolean | null;
          max_plates?: number | null;
          min_plates?: number | null;
          nonveg_price_per_plate_paise?: number | null;
          organization_id?: string;
          service_id?: string;
          service_staff_included?: boolean | null;
          updated_at?: string;
          veg_price_per_plate_paise?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "catering_details_service_id_organization_id_fkey";
            columns: ["service_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      cities: {
        Row: {
          active: boolean;
          alt_names: string[];
          country: string;
          created_at: string;
          id: string;
          is_launch_city: boolean;
          name: string;
          name_i18n: NonNullable<Json>;
          slug: string;
          state: string;
          state_code: string;
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          alt_names?: string[];
          country?: string;
          created_at?: string;
          id?: string;
          is_launch_city?: boolean;
          name: string;
          name_i18n?: NonNullable<Json>;
          slug: string;
          state: string;
          state_code: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          alt_names?: string[];
          country?: string;
          created_at?: string;
          id?: string;
          is_launch_city?: boolean;
          name?: string;
          name_i18n?: NonNullable<Json>;
          slug?: string;
          state?: string;
          state_code?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      consent_records: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"] | null;
          created_at: string;
          granted: boolean;
          id: string;
          policy_version_id: string | null;
          purpose: Database["public"]["Enums"]["consent_purpose"];
          source: string;
          user_agent: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          channel?: Database["public"]["Enums"]["notification_channel"] | null;
          created_at?: string;
          granted: boolean;
          id?: string;
          policy_version_id?: string | null;
          purpose: Database["public"]["Enums"]["consent_purpose"];
          source: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"] | null;
          created_at?: string;
          granted?: boolean;
          id?: string;
          policy_version_id?: string | null;
          purpose?: Database["public"]["Enums"]["consent_purpose"];
          source?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "consent_records_policy_version_id_fkey";
            columns: ["policy_version_id"];
            isOneToOne: false;
            referencedRelation: "policy_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consent_records_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      enquiries: {
        Row: {
          booking_mode: Database["public"]["Enums"]["booking_mode"];
          branch_id: string | null;
          created_at: string;
          customer_id: string;
          event_date: string;
          event_id: string | null;
          guests: number | null;
          hold_expires_at: string | null;
          id: string;
          idempotency_key: string | null;
          message: string | null;
          organization_id: string;
          period: unknown;
          price_snapshot: NonNullable<Json>;
          reservation_id: string | null;
          resource_id: string | null;
          service_id: string;
          status: Database["public"]["Enums"]["enquiry_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          booking_mode: Database["public"]["Enums"]["booking_mode"];
          branch_id?: string | null;
          created_at?: string;
          customer_id: string;
          event_date: string;
          event_id?: string | null;
          guests?: number | null;
          hold_expires_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          message?: string | null;
          organization_id: string;
          period: unknown;
          price_snapshot?: NonNullable<Json>;
          reservation_id?: string | null;
          resource_id?: string | null;
          service_id: string;
          status?: Database["public"]["Enums"]["enquiry_status"];
          updated_at?: string;
        };
        Update: {
          booking_mode?: Database["public"]["Enums"]["booking_mode"];
          branch_id?: string | null;
          created_at?: string;
          customer_id?: string;
          event_date?: string;
          event_id?: string | null;
          guests?: number | null;
          hold_expires_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          message?: string | null;
          organization_id?: string;
          period?: unknown;
          price_snapshot?: NonNullable<Json>;
          reservation_id?: string | null;
          resource_id?: string | null;
          service_id?: string;
          status?: Database["public"]["Enums"]["enquiry_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enquiries_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enquiries_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enquiries_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: false;
            referencedRelation: "resource_reservations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enquiries_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: false;
            referencedRelation: "bookable_resources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enquiries_service_id_organization_id_fkey";
            columns: ["service_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      enquiry_messages: {
        Row: {
          body: string;
          created_at: string;
          enquiry_id: string;
          id: string;
          sender_id: string | null;
          sender_side: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          created_at?: string;
          enquiry_id: string;
          id?: string;
          sender_id?: string | null;
          sender_side: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          enquiry_id?: string;
          id?: string;
          sender_id?: string | null;
          sender_side?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enquiry_messages_enquiry_id_fkey";
            columns: ["enquiry_id"];
            isOneToOne: false;
            referencedRelation: "enquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enquiry_messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_budget_lines: {
        Row: {
          business_category_id: string | null;
          created_at: string;
          event_id: string;
          id: string;
          label: string | null;
          planned_paise: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          business_category_id?: string | null;
          created_at?: string;
          event_id: string;
          id?: string;
          label?: string | null;
          planned_paise?: number;
          updated_at?: string;
        };
        Update: {
          business_category_id?: string | null;
          created_at?: string;
          event_id?: string;
          id?: string;
          label?: string | null;
          planned_paise?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_budget_lines_business_category_id_fkey";
            columns: ["business_category_id"];
            isOneToOne: false;
            referencedRelation: "business_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_budget_lines_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_guests: {
        Row: {
          attending_count: number;
          created_at: string;
          created_by: string | null;
          email: string | null;
          event_id: string;
          group_label: string | null;
          id: string;
          invite_token: string | null;
          invited_at: string | null;
          name: string;
          party_size: number;
          phone: string | null;
          responded_at: string | null;
          rsvp_note: string | null;
          rsvp_status: Database["public"]["Enums"]["rsvp_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          attending_count?: number;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          event_id: string;
          group_label?: string | null;
          id?: string;
          invite_token?: string | null;
          invited_at?: string | null;
          name: string;
          party_size?: number;
          phone?: string | null;
          responded_at?: string | null;
          rsvp_note?: string | null;
          rsvp_status?: Database["public"]["Enums"]["rsvp_status"];
          updated_at?: string;
        };
        Update: {
          attending_count?: number;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          event_id?: string;
          group_label?: string | null;
          id?: string;
          invite_token?: string | null;
          invited_at?: string | null;
          name?: string;
          party_size?: number;
          phone?: string | null;
          responded_at?: string | null;
          rsvp_note?: string | null;
          rsvp_status?: Database["public"]["Enums"]["rsvp_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_guests_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_guests_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_invitations: {
        Row: {
          accepted_by: string | null;
          created_at: string;
          email: string;
          event_id: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          responded_at: string | null;
          role: Database["public"]["Enums"]["event_role"];
          status: Database["public"]["Enums"]["invitation_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          event_id: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          responded_at?: string | null;
          role: Database["public"]["Enums"]["event_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
          updated_at?: string;
        };
        Update: {
          accepted_by?: string | null;
          created_at?: string;
          email?: string;
          event_id?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          responded_at?: string | null;
          role?: Database["public"]["Enums"]["event_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_invitations_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      event_members: {
        Row: {
          added_by: string | null;
          created_at: string;
          event_id: string;
          role: Database["public"]["Enums"]["event_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          added_by?: string | null;
          created_at?: string;
          event_id: string;
          role: Database["public"]["Enums"]["event_role"];
          user_id: string;
        };
        Update: {
          added_by?: string | null;
          created_at?: string;
          event_id?: string;
          role?: Database["public"]["Enums"]["event_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_members_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_members_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          city_id: string | null;
          created_at: string;
          currency: string;
          end_date: string;
          event_type: string;
          guest_estimate: number | null;
          hosts_text: string | null;
          id: string;
          idempotency_key: string | null;
          invitation_message: string | null;
          owner_id: string;
          start_date: string;
          status: Database["public"]["Enums"]["event_status"];
          title: string;
          updated_at: string;
          venue_text: string | null;
        };
        ComputedFields: never;
        Insert: {
          city_id?: string | null;
          created_at?: string;
          currency?: string;
          end_date: string;
          event_type: string;
          guest_estimate?: number | null;
          hosts_text?: string | null;
          id?: string;
          idempotency_key?: string | null;
          invitation_message?: string | null;
          owner_id: string;
          start_date: string;
          status?: Database["public"]["Enums"]["event_status"];
          title: string;
          updated_at?: string;
          venue_text?: string | null;
        };
        Update: {
          city_id?: string | null;
          created_at?: string;
          currency?: string;
          end_date?: string;
          event_type?: string;
          guest_estimate?: number | null;
          hosts_text?: string | null;
          id?: string;
          idempotency_key?: string | null;
          invitation_message?: string | null;
          owner_id?: string;
          start_date?: string;
          status?: Database["public"]["Enums"]["event_status"];
          title?: string;
          updated_at?: string;
          venue_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "events_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      job_assignments: {
        Row: {
          assigned_by: string | null;
          call_time: string | null;
          cancelled_at: string | null;
          checked_in_at: string | null;
          completed_at: string | null;
          created_at: string;
          id: string;
          job_id: string;
          organization_id: string;
          pay_paise: number | null;
          responded_at: string | null;
          role_label: string | null;
          staff_note: string | null;
          staff_profile_id: string;
          staff_reservation_id: string | null;
          status: Database["public"]["Enums"]["job_assignment_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          assigned_by?: string | null;
          call_time?: string | null;
          cancelled_at?: string | null;
          checked_in_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          job_id: string;
          organization_id: string;
          pay_paise?: number | null;
          responded_at?: string | null;
          role_label?: string | null;
          staff_note?: string | null;
          staff_profile_id: string;
          staff_reservation_id?: string | null;
          status?: Database["public"]["Enums"]["job_assignment_status"];
          updated_at?: string;
        };
        Update: {
          assigned_by?: string | null;
          call_time?: string | null;
          cancelled_at?: string | null;
          checked_in_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          job_id?: string;
          organization_id?: string;
          pay_paise?: number | null;
          responded_at?: string | null;
          role_label?: string | null;
          staff_note?: string | null;
          staff_profile_id?: string;
          staff_reservation_id?: string | null;
          status?: Database["public"]["Enums"]["job_assignment_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_assignments_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_assignments_job_id_organization_id_fkey";
            columns: ["job_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "job_assignments_staff_profile_id_organization_id_fkey";
            columns: ["staff_profile_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "job_assignments_staff_reservation_id_fkey";
            columns: ["staff_reservation_id"];
            isOneToOne: false;
            referencedRelation: "resource_reservations";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          booking_item_id: string | null;
          branch_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          instructions: string | null;
          organization_id: string;
          period: unknown;
          reservation_id: string | null;
          site_address: string | null;
          status: string;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          booking_item_id?: string | null;
          branch_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          instructions?: string | null;
          organization_id: string;
          period: unknown;
          reservation_id?: string | null;
          site_address?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          booking_item_id?: string | null;
          branch_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          instructions?: string | null;
          organization_id?: string;
          period?: unknown;
          reservation_id?: string | null;
          site_address?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_booking_item_id_fkey";
            columns: ["booking_item_id"];
            isOneToOne: true;
            referencedRelation: "booking_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_reservation_id_fkey";
            columns: ["reservation_id"];
            isOneToOne: true;
            referencedRelation: "resource_reservations";
            referencedColumns: ["id"];
          },
        ];
      };
      member_branch_access: {
        Row: {
          branch_id: string;
          created_at: string;
          member_id: string;
          organization_id: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          created_at?: string;
          member_id: string;
          organization_id: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          member_id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_branch_access_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "member_branch_access_member_id_organization_id_fkey";
            columns: ["member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_members";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      notification_outbox: {
        Row: {
          attempts: number;
          channel: Database["public"]["Enums"]["notification_channel"];
          created_at: string;
          id: string;
          last_error: string | null;
          locale: Database["public"]["Enums"]["app_locale"];
          next_attempt_at: string;
          notification_id: string | null;
          params: NonNullable<Json>;
          provider: string | null;
          provider_message_id: string | null;
          sent_at: string | null;
          status: Database["public"]["Enums"]["delivery_status"];
          template: string;
          to_address: string;
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          channel: Database["public"]["Enums"]["notification_channel"];
          created_at?: string;
          id?: string;
          last_error?: string | null;
          locale?: Database["public"]["Enums"]["app_locale"];
          next_attempt_at?: string;
          notification_id?: string | null;
          params?: NonNullable<Json>;
          provider?: string | null;
          provider_message_id?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["delivery_status"];
          template: string;
          to_address: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          attempts?: number;
          channel?: Database["public"]["Enums"]["notification_channel"];
          created_at?: string;
          id?: string;
          last_error?: string | null;
          locale?: Database["public"]["Enums"]["app_locale"];
          next_attempt_at?: string;
          notification_id?: string | null;
          params?: NonNullable<Json>;
          provider?: string | null;
          provider_message_id?: string | null;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["delivery_status"];
          template?: string;
          to_address?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notification_outbox_notification_id_fkey";
            columns: ["notification_id"];
            isOneToOne: false;
            referencedRelation: "notifications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_outbox_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_preferences: {
        Row: {
          category: string;
          channel: Database["public"]["Enums"]["notification_channel"];
          enabled: boolean;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          category: string;
          channel: Database["public"]["Enums"]["notification_channel"];
          enabled?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category?: string;
          channel?: Database["public"]["Enums"]["notification_channel"];
          enabled?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          kind: string;
          link: string | null;
          params: NonNullable<Json>;
          read_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          category: string;
          created_at?: string;
          id?: string;
          kind: string;
          link?: string | null;
          params?: NonNullable<Json>;
          read_at?: string | null;
          user_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          link?: string | null;
          params?: NonNullable<Json>;
          read_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_invitations: {
        Row: {
          accepted_by: string | null;
          branch_ids: string[];
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          organization_id: string;
          responded_at: string | null;
          role: Database["public"]["Enums"]["org_role"];
          status: Database["public"]["Enums"]["invitation_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_by?: string | null;
          branch_ids?: string[];
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          organization_id: string;
          responded_at?: string | null;
          role: Database["public"]["Enums"]["org_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
          updated_at?: string;
        };
        Update: {
          accepted_by?: string | null;
          branch_ids?: string[];
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          organization_id?: string;
          responded_at?: string | null;
          role?: Database["public"]["Enums"]["org_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          created_at: string;
          id: string;
          invited_by: string | null;
          organization_id: string;
          role: Database["public"]["Enums"]["org_role"];
          status: Database["public"]["Enums"]["member_status"];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          organization_id: string;
          role: Database["public"]["Enums"]["org_role"];
          status?: Database["public"]["Enums"]["member_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          organization_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          status?: Database["public"]["Enums"]["member_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          idempotency_key: string | null;
          legal_name: string | null;
          name: string;
          primary_business_category_id: string | null;
          primary_city_id: string | null;
          slug: string;
          status: Database["public"]["Enums"]["organization_status"];
          status_changed_at: string | null;
          status_changed_by: string | null;
          status_reason: string | null;
          updated_at: string;
          verification_status: Database["public"]["Enums"]["verification_status"];
          verified_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          idempotency_key?: string | null;
          legal_name?: string | null;
          name: string;
          primary_business_category_id?: string | null;
          primary_city_id?: string | null;
          slug: string;
          status?: Database["public"]["Enums"]["organization_status"];
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          status_reason?: string | null;
          updated_at?: string;
          verification_status?: Database["public"]["Enums"]["verification_status"];
          verified_at?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          idempotency_key?: string | null;
          legal_name?: string | null;
          name?: string;
          primary_business_category_id?: string | null;
          primary_city_id?: string | null;
          slug?: string;
          status?: Database["public"]["Enums"]["organization_status"];
          status_changed_at?: string | null;
          status_changed_by?: string | null;
          status_reason?: string | null;
          updated_at?: string;
          verification_status?: Database["public"]["Enums"]["verification_status"];
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organizations_primary_business_category_id_fkey";
            columns: ["primary_business_category_id"];
            isOneToOne: false;
            referencedRelation: "business_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organizations_primary_city_id_fkey";
            columns: ["primary_city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organizations_status_changed_by_fkey";
            columns: ["status_changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_webhook_events: {
        Row: {
          error: string | null;
          event_id: string;
          event_type: string;
          payload: NonNullable<Json>;
          processed_at: string | null;
          received_at: string;
        };
        ComputedFields: never;
        Insert: {
          error?: string | null;
          event_id: string;
          event_type: string;
          payload: NonNullable<Json>;
          processed_at?: string | null;
          received_at?: string;
        };
        Update: {
          error?: string | null;
          event_id?: string;
          event_type?: string;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          received_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          amount_paise: number;
          booking_item_id: string;
          created_at: string;
          currency: string;
          customer_id: string;
          id: string;
          idempotency_key: string | null;
          kind: string;
          method: Database["public"]["Enums"]["payment_method"];
          note: string | null;
          offline_mode: Database["public"]["Enums"]["offline_payment_mode"] | null;
          organization_id: string;
          paid_at: string | null;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          receipt_number: string | null;
          recorded_by: string | null;
          reference: string | null;
          status: Database["public"]["Enums"]["payment_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_paise: number;
          booking_item_id: string;
          created_at?: string;
          currency?: string;
          customer_id: string;
          id?: string;
          idempotency_key?: string | null;
          kind: string;
          method: Database["public"]["Enums"]["payment_method"];
          note?: string | null;
          offline_mode?: Database["public"]["Enums"]["offline_payment_mode"] | null;
          organization_id: string;
          paid_at?: string | null;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          receipt_number?: string | null;
          recorded_by?: string | null;
          reference?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
        };
        Update: {
          amount_paise?: number;
          booking_item_id?: string;
          created_at?: string;
          currency?: string;
          customer_id?: string;
          id?: string;
          idempotency_key?: string | null;
          kind?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          note?: string | null;
          offline_mode?: Database["public"]["Enums"]["offline_payment_mode"] | null;
          organization_id?: string;
          paid_at?: string | null;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          receipt_number?: string | null;
          recorded_by?: string | null;
          reference?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_booking_item_id_fkey";
            columns: ["booking_item_id"];
            isOneToOne: false;
            referencedRelation: "booking_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      permissions: {
        Row: {
          code: string;
          created_at: string;
          description: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          description: string;
          id?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string;
          id?: string;
        };
        Relationships: [];
      };
      policy_versions: {
        Row: {
          body_md: string;
          created_at: string;
          created_by: string | null;
          effective_from: string;
          id: string;
          locale: Database["public"]["Enums"]["app_locale"];
          policy_type: Database["public"]["Enums"]["policy_type"];
          published_at: string | null;
          title: string;
          updated_at: string;
          version: string;
        };
        ComputedFields: never;
        Insert: {
          body_md: string;
          created_at?: string;
          created_by?: string | null;
          effective_from: string;
          id?: string;
          locale?: Database["public"]["Enums"]["app_locale"];
          policy_type: Database["public"]["Enums"]["policy_type"];
          published_at?: string | null;
          title: string;
          updated_at?: string;
          version: string;
        };
        Update: {
          body_md?: string;
          created_at?: string;
          created_by?: string | null;
          effective_from?: string;
          id?: string;
          locale?: Database["public"]["Enums"]["app_locale"];
          policy_type?: Database["public"]["Enums"]["policy_type"];
          published_at?: string | null;
          title?: string;
          updated_at?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "policy_versions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          blocked_at: string | null;
          blocked_by: string | null;
          blocked_reason: string | null;
          created_at: string;
          display_name: string | null;
          email: string | null;
          full_name: string | null;
          id: string;
          phone: string | null;
          phone_verified_at: string | null;
          preferred_locale: Database["public"]["Enums"]["app_locale"];
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_path?: string | null;
          blocked_at?: string | null;
          blocked_by?: string | null;
          blocked_reason?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          phone_verified_at?: string | null;
          preferred_locale?: Database["public"]["Enums"]["app_locale"];
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          blocked_at?: string | null;
          blocked_by?: string | null;
          blocked_reason?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          phone_verified_at?: string | null;
          preferred_locale?: Database["public"]["Enums"]["app_locale"];
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_blocked_by_fkey";
            columns: ["blocked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      quotation_items: {
        Row: {
          amount_paise: number;
          description: string;
          id: string;
          quantity: number;
          quotation_id: string;
          sort_order: number;
          unit_price_paise: number;
        };
        ComputedFields: never;
        Insert: {
          amount_paise: number;
          description: string;
          id?: string;
          quantity: number;
          quotation_id: string;
          sort_order?: number;
          unit_price_paise: number;
        };
        Update: {
          amount_paise?: number;
          description?: string;
          id?: string;
          quantity?: number;
          quotation_id?: string;
          sort_order?: number;
          unit_price_paise?: number;
        };
        Relationships: [
          {
            foreignKeyName: "quotation_items_quotation_id_fkey";
            columns: ["quotation_id"];
            isOneToOne: false;
            referencedRelation: "quotations";
            referencedColumns: ["id"];
          },
        ];
      };
      quotations: {
        Row: {
          created_at: string;
          created_by: string | null;
          currency: string;
          discount_paise: number;
          enquiry_id: string;
          id: string;
          notes: string | null;
          organization_id: string;
          responded_at: string | null;
          sent_at: string;
          status: Database["public"]["Enums"]["quotation_status"];
          subtotal_paise: number;
          tax_bps: number;
          tax_paise: number;
          terms: string | null;
          total_paise: number;
          updated_at: string;
          valid_until: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          discount_paise?: number;
          enquiry_id: string;
          id?: string;
          notes?: string | null;
          organization_id: string;
          responded_at?: string | null;
          sent_at?: string;
          status?: Database["public"]["Enums"]["quotation_status"];
          subtotal_paise: number;
          tax_bps?: number;
          tax_paise?: number;
          terms?: string | null;
          total_paise: number;
          updated_at?: string;
          valid_until: string;
          version: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          discount_paise?: number;
          enquiry_id?: string;
          id?: string;
          notes?: string | null;
          organization_id?: string;
          responded_at?: string | null;
          sent_at?: string;
          status?: Database["public"]["Enums"]["quotation_status"];
          subtotal_paise?: number;
          tax_bps?: number;
          tax_paise?: number;
          terms?: string | null;
          total_paise?: number;
          updated_at?: string;
          valid_until?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "quotations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotations_enquiry_id_fkey";
            columns: ["enquiry_id"];
            isOneToOne: false;
            referencedRelation: "enquiries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      refunds: {
        Row: {
          amount_paise: number;
          booking_item_id: string;
          created_at: string;
          currency: string;
          customer_id: string;
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          organization_id: string;
          payment_id: string;
          processed_at: string | null;
          processed_by: string | null;
          razorpay_refund_id: string | null;
          reason: string | null;
          reference: string | null;
          status: Database["public"]["Enums"]["refund_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_paise: number;
          booking_item_id: string;
          created_at?: string;
          currency?: string;
          customer_id: string;
          id?: string;
          method: Database["public"]["Enums"]["payment_method"];
          organization_id: string;
          payment_id: string;
          processed_at?: string | null;
          processed_by?: string | null;
          razorpay_refund_id?: string | null;
          reason?: string | null;
          reference?: string | null;
          status?: Database["public"]["Enums"]["refund_status"];
          updated_at?: string;
        };
        Update: {
          amount_paise?: number;
          booking_item_id?: string;
          created_at?: string;
          currency?: string;
          customer_id?: string;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          organization_id?: string;
          payment_id?: string;
          processed_at?: string | null;
          processed_by?: string | null;
          razorpay_refund_id?: string | null;
          reason?: string | null;
          reference?: string | null;
          status?: Database["public"]["Enums"]["refund_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "refunds_booking_item_id_fkey";
            columns: ["booking_item_id"];
            isOneToOne: false;
            referencedRelation: "booking_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "refunds_processed_by_fkey";
            columns: ["processed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      resource_reservations: {
        Row: {
          allocation_mode: Database["public"]["Enums"]["allocation_mode"];
          blocked_period: unknown;
          booking_item_id: string | null;
          created_at: string;
          created_by: string | null;
          hold_expires_at: string | null;
          id: string;
          idempotency_key: string | null;
          notes: string | null;
          organization_id: string;
          period: unknown;
          quantity: number;
          released_at: string | null;
          resource_id: string;
          source: Database["public"]["Enums"]["reservation_source"];
          status: Database["public"]["Enums"]["reservation_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          allocation_mode: Database["public"]["Enums"]["allocation_mode"];
          blocked_period: unknown;
          booking_item_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          hold_expires_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          notes?: string | null;
          organization_id: string;
          period: unknown;
          quantity?: number;
          released_at?: string | null;
          resource_id: string;
          source: Database["public"]["Enums"]["reservation_source"];
          status: Database["public"]["Enums"]["reservation_status"];
          updated_at?: string;
        };
        Update: {
          allocation_mode?: Database["public"]["Enums"]["allocation_mode"];
          blocked_period?: unknown;
          booking_item_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          hold_expires_at?: string | null;
          id?: string;
          idempotency_key?: string | null;
          notes?: string | null;
          organization_id?: string;
          period?: unknown;
          quantity?: number;
          released_at?: string | null;
          resource_id?: string;
          source?: Database["public"]["Enums"]["reservation_source"];
          status?: Database["public"]["Enums"]["reservation_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "resource_reservations_booking_item_fk";
            columns: ["booking_item_id"];
            isOneToOne: false;
            referencedRelation: "booking_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resource_reservations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resource_reservations_resource_id_organization_id_fkey";
            columns: ["resource_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "bookable_resources";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          created_at: string;
          permission_id: string;
          role_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          permission_id: string;
          role_id: string;
        };
        Update: {
          created_at?: string;
          permission_id?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey";
            columns: ["permission_id"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          id: string;
          is_system: boolean;
          name: string;
          scope: Database["public"]["Enums"]["role_scope"];
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_system?: boolean;
          name: string;
          scope: Database["public"]["Enums"]["role_scope"];
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_system?: boolean;
          name?: string;
          scope?: Database["public"]["Enums"]["role_scope"];
        };
        Relationships: [];
      };
      service_categories: {
        Row: {
          active: boolean;
          attribute_schema: NonNullable<Json>;
          business_category_id: string;
          created_at: string;
          default_booking_mode: Database["public"]["Enums"]["booking_mode"];
          description: string | null;
          display_order: number;
          id: string;
          name: string;
          name_i18n: NonNullable<Json>;
          parent_id: string | null;
          resource_kind_hint: Database["public"]["Enums"]["resource_kind"] | null;
          slug: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          attribute_schema?: NonNullable<Json>;
          business_category_id: string;
          created_at?: string;
          default_booking_mode?: Database["public"]["Enums"]["booking_mode"];
          description?: string | null;
          display_order?: number;
          id?: string;
          name: string;
          name_i18n?: NonNullable<Json>;
          parent_id?: string | null;
          resource_kind_hint?: Database["public"]["Enums"]["resource_kind"] | null;
          slug: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          attribute_schema?: NonNullable<Json>;
          business_category_id?: string;
          created_at?: string;
          default_booking_mode?: Database["public"]["Enums"]["booking_mode"];
          description?: string | null;
          display_order?: number;
          id?: string;
          name?: string;
          name_i18n?: NonNullable<Json>;
          parent_id?: string | null;
          resource_kind_hint?: Database["public"]["Enums"]["resource_kind"] | null;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_categories_business_category_id_fkey";
            columns: ["business_category_id"];
            isOneToOne: false;
            referencedRelation: "business_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "service_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      service_media: {
        Row: {
          alt_text: string | null;
          created_at: string;
          id: string;
          is_cover: boolean;
          organization_id: string;
          service_id: string;
          sort_order: number;
          storage_path: string;
        };
        ComputedFields: never;
        Insert: {
          alt_text?: string | null;
          created_at?: string;
          id?: string;
          is_cover?: boolean;
          organization_id: string;
          service_id: string;
          sort_order?: number;
          storage_path: string;
        };
        Update: {
          alt_text?: string | null;
          created_at?: string;
          id?: string;
          is_cover?: boolean;
          organization_id?: string;
          service_id?: string;
          sort_order?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_media_service_id_organization_id_fkey";
            columns: ["service_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      services: {
        Row: {
          advance_bps: number;
          area_id: string | null;
          attributes: NonNullable<Json>;
          auspicious_surcharge_bps: number;
          base_price_paise: number | null;
          booking_mode: Database["public"]["Enums"]["booking_mode"];
          branch_id: string | null;
          cancellation_policy: Database["public"]["Enums"]["cancellation_policy"];
          city_id: string;
          created_at: string;
          created_by: string | null;
          currency: string;
          description: string | null;
          id: string;
          max_guests: number | null;
          max_price_paise: number | null;
          min_guests: number | null;
          organization_id: string;
          price_type: Database["public"]["Enums"]["price_type"];
          price_unit: Database["public"]["Enums"]["price_unit"] | null;
          published_at: string | null;
          search_document: unknown;
          service_category_id: string;
          slug: string;
          status: Database["public"]["Enums"]["service_status"];
          summary: string | null;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          advance_bps?: number;
          area_id?: string | null;
          attributes?: NonNullable<Json>;
          auspicious_surcharge_bps?: number;
          base_price_paise?: number | null;
          booking_mode?: Database["public"]["Enums"]["booking_mode"];
          branch_id?: string | null;
          cancellation_policy?: Database["public"]["Enums"]["cancellation_policy"];
          city_id: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string | null;
          id?: string;
          max_guests?: number | null;
          max_price_paise?: number | null;
          min_guests?: number | null;
          organization_id: string;
          price_type?: Database["public"]["Enums"]["price_type"];
          price_unit?: Database["public"]["Enums"]["price_unit"] | null;
          published_at?: string | null;
          search_document?: unknown;
          service_category_id: string;
          slug: string;
          status?: Database["public"]["Enums"]["service_status"];
          summary?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          advance_bps?: number;
          area_id?: string | null;
          attributes?: NonNullable<Json>;
          auspicious_surcharge_bps?: number;
          base_price_paise?: number | null;
          booking_mode?: Database["public"]["Enums"]["booking_mode"];
          branch_id?: string | null;
          cancellation_policy?: Database["public"]["Enums"]["cancellation_policy"];
          city_id?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string | null;
          id?: string;
          max_guests?: number | null;
          max_price_paise?: number | null;
          min_guests?: number | null;
          organization_id?: string;
          price_type?: Database["public"]["Enums"]["price_type"];
          price_unit?: Database["public"]["Enums"]["price_unit"] | null;
          published_at?: string | null;
          search_document?: unknown;
          service_category_id?: string;
          slug?: string;
          status?: Database["public"]["Enums"]["service_status"];
          summary?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_area_id_fkey";
            columns: ["area_id"];
            isOneToOne: false;
            referencedRelation: "areas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "services_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "services_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "services_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "services_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "services_service_category_id_fkey";
            columns: ["service_category_id"];
            isOneToOne: false;
            referencedRelation: "service_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_profiles: {
        Row: {
          active: boolean;
          branch_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          day_rate_paise: number | null;
          full_name: string;
          id: string;
          member_id: string | null;
          notes: string | null;
          organization_id: string;
          phone: string | null;
          skill: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          branch_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          day_rate_paise?: number | null;
          full_name: string;
          id?: string;
          member_id?: string | null;
          notes?: string | null;
          organization_id: string;
          phone?: string | null;
          skill?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          branch_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          day_rate_paise?: number | null;
          full_name?: string;
          id?: string;
          member_id?: string | null;
          notes?: string | null;
          organization_id?: string;
          phone?: string | null;
          skill?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_profiles_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "staff_profiles_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_profiles_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "organization_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_profiles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      user_role_assignments: {
        Row: {
          created_at: string;
          granted_by: string | null;
          id: string;
          role_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          role_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          role_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_role_assignments_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_role_assignments_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_role_assignments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      vendor_expenses: {
        Row: {
          amount_paise: number;
          assignment_id: string | null;
          booking_item_id: string | null;
          branch_id: string | null;
          category: Database["public"]["Enums"]["expense_category"];
          created_at: string;
          created_by: string | null;
          currency: string;
          id: string;
          idempotency_key: string | null;
          job_id: string | null;
          mode: Database["public"]["Enums"]["offline_payment_mode"] | null;
          note: string | null;
          organization_id: string;
          payee: string | null;
          reference: string | null;
          spent_on: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_paise: number;
          assignment_id?: string | null;
          booking_item_id?: string | null;
          branch_id?: string | null;
          category: Database["public"]["Enums"]["expense_category"];
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          id?: string;
          idempotency_key?: string | null;
          job_id?: string | null;
          mode?: Database["public"]["Enums"]["offline_payment_mode"] | null;
          note?: string | null;
          organization_id: string;
          payee?: string | null;
          reference?: string | null;
          spent_on: string;
          updated_at?: string;
        };
        Update: {
          amount_paise?: number;
          assignment_id?: string | null;
          booking_item_id?: string | null;
          branch_id?: string | null;
          category?: Database["public"]["Enums"]["expense_category"];
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          id?: string;
          idempotency_key?: string | null;
          job_id?: string | null;
          mode?: Database["public"]["Enums"]["offline_payment_mode"] | null;
          note?: string | null;
          organization_id?: string;
          payee?: string | null;
          reference?: string | null;
          spent_on?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vendor_expenses_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: true;
            referencedRelation: "job_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vendor_expenses_booking_item_id_fkey";
            columns: ["booking_item_id"];
            isOneToOne: false;
            referencedRelation: "booking_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vendor_expenses_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "vendor_expenses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vendor_expenses_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vendor_expenses_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      venue_details: {
        Row: {
          air_conditioned: boolean | null;
          alcohol_allowed: boolean | null;
          area_sqft: number | null;
          catering_policy: Database["public"]["Enums"]["outside_policy"] | null;
          decor_policy: Database["public"]["Enums"]["outside_policy"] | null;
          dining_capacity: number | null;
          floating_capacity: number | null;
          organization_id: string;
          parking_cars: number | null;
          rooms: number | null;
          seated_capacity: number | null;
          service_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          air_conditioned?: boolean | null;
          alcohol_allowed?: boolean | null;
          area_sqft?: number | null;
          catering_policy?: Database["public"]["Enums"]["outside_policy"] | null;
          decor_policy?: Database["public"]["Enums"]["outside_policy"] | null;
          dining_capacity?: number | null;
          floating_capacity?: number | null;
          organization_id: string;
          parking_cars?: number | null;
          rooms?: number | null;
          seated_capacity?: number | null;
          service_id: string;
          updated_at?: string;
        };
        Update: {
          air_conditioned?: boolean | null;
          alcohol_allowed?: boolean | null;
          area_sqft?: number | null;
          catering_policy?: Database["public"]["Enums"]["outside_policy"] | null;
          decor_policy?: Database["public"]["Enums"]["outside_policy"] | null;
          dining_capacity?: number | null;
          floating_capacity?: number | null;
          organization_id?: string;
          parking_cars?: number | null;
          rooms?: number | null;
          seated_capacity?: number | null;
          service_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venue_details_service_id_organization_id_fkey";
            columns: ["service_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_list_users: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string };
        Returns: {
          blocked_at: string;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          last_sign_in_at: string;
          phone: string;
          roles: string[];
          total_count: number;
          vendor_count: number;
        }[];
      };
      admin_list_vendors: {
        Args: {
          p_limit?: number;
          p_offset?: number;
          p_search?: string;
          p_status?: Database["public"]["Enums"]["organization_status"];
        };
        Returns: {
          bookings: number;
          category: string;
          city: string;
          created_at: string;
          id: string;
          listings: number;
          name: string;
          owner_email: string;
          slug: string;
          status: Database["public"]["Enums"]["organization_status"];
          total_count: number;
          verification_status: Database["public"]["Enums"]["verification_status"];
        }[];
      };
      admin_user_overview: { Args: { p_user_id: string }; Returns: Json };
      admin_vendor_overview: {
        Args: { p_organization_id: string };
        Returns: Json;
      };
      assign_staff: {
        Args: {
          p_call_time?: string;
          p_job_id: string;
          p_pay_paise?: number;
          p_role_label?: string;
          p_staff_profile_id: string;
        };
        Returns: string;
      };
      attach_payment_order: {
        Args: { p_order_id: string; p_payment_id: string };
        Returns: undefined;
      };
      begin_refund: {
        Args: { p_refund_id: string };
        Returns: {
          amount_paise: number;
          method: Database["public"]["Enums"]["payment_method"];
          razorpay_payment_id: string;
          refund_id: string;
        }[];
      };
      booking_preview: {
        Args: { p_enquiry_id: string };
        Returns: {
          advance_bps: number;
          advance_paise: number;
          cancellation_policy: Database["public"]["Enums"]["cancellation_policy"];
          pay_by: string;
          total_paise: number;
        }[];
      };
      can_access_branch: { Args: { p_branch_id: string }; Returns: boolean };
      cancel_booking_item: {
        Args: { p_booking_item_id: string; p_reason: string };
        Returns: number;
      };
      cancel_enquiry: { Args: { p_enquiry_id: string }; Returns: undefined };
      cancellation_quote: {
        Args: { p_booking_item_id: string };
        Returns: {
          by_vendor: boolean;
          days_before: number;
          refund_bps: number;
          refund_paise: number;
        }[];
      };
      claim_outbox: {
        Args: { p_limit?: number };
        Returns: {
          attempts: number;
          channel: Database["public"]["Enums"]["notification_channel"];
          created_at: string;
          id: string;
          last_error: string | null;
          locale: Database["public"]["Enums"]["app_locale"];
          next_attempt_at: string;
          notification_id: string | null;
          params: NonNullable<Json>;
          provider: string | null;
          provider_message_id: string | null;
          sent_at: string | null;
          status: Database["public"]["Enums"]["delivery_status"];
          template: string;
          to_address: string;
          updated_at: string;
          user_id: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "notification_outbox";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      complete_outbox: {
        Args: {
          p_error: string;
          p_id: string;
          p_provider: string;
          p_provider_message_id: string;
          p_success: boolean;
        };
        Returns: undefined;
      };
      complete_refund: {
        Args: { p_reference: string; p_refund_id: string; p_success: boolean };
        Returns: undefined;
      };
      confirm_online_payment: {
        Args: {
          p_amount_paise: number;
          p_order_id: string;
          p_payment_id: string;
        };
        Returns: string;
      };
      create_booking: {
        Args: { p_enquiry_id: string; p_idempotency_key: string };
        Returns: string;
      };
      create_enquiry: {
        Args: {
          p_end_time: string;
          p_event_date: string;
          p_guests: number;
          p_idempotency_key: string;
          p_message: string;
          p_service_id: string;
          p_start_time: string;
        };
        Returns: string;
      };
      create_event: {
        Args: {
          p_city_id: string;
          p_end_date: string;
          p_event_type: string;
          p_guest_estimate: number;
          p_idempotency_key: string;
          p_start_date: string;
          p_title: string;
        };
        Returns: string;
      };
      create_invitation: {
        Args: {
          p_branch_ids?: string[];
          p_email: string;
          p_organization_id: string;
          p_role: Database["public"]["Enums"]["org_role"];
        };
        Returns: string;
      };
      create_organization: {
        Args: {
          p_business_category_id: string;
          p_city_id: string;
          p_idempotency_key: string;
          p_name: string;
        };
        Returns: string;
      };
      decline_enquiry: {
        Args: { p_enquiry_id: string; p_reason: string };
        Returns: undefined;
      };
      enquiry_contact: {
        Args: { p_enquiry_id: string };
        Returns: {
          email: string;
          name: string;
          phone: string;
        }[];
      };
      ensure_job: {
        Args: { p_booking_item_id?: string; p_reservation_id?: string };
        Returns: string;
      };
      event_member_directory: {
        Args: { p_event_id: string };
        Returns: {
          created_at: string;
          email: string;
          name: string;
          role: Database["public"]["Enums"]["event_role"];
          user_id: string;
        }[];
      };
      event_vendors: {
        Args: { p_event_id: string };
        Returns: {
          booking_item_id: string;
          booking_status: string;
          business_category_id: string;
          category_slug: string;
          currency: string;
          enquiry_id: string;
          enquiry_status: string;
          event_date: string;
          listing_title: string;
          paid_paise: number;
          refunded_paise: number;
          total_paise: number;
          vendor_name: string;
        }[];
      };
      get_listing: { Args: { p_slug: string }; Returns: Json };
      guest_invite_token: {
        Args: { p_guest_id: string; p_regenerate?: boolean };
        Returns: string;
      };
      has_org_role: {
        Args: { p_organization_id: string; p_roles: string[] };
        Returns: boolean;
      };
      has_platform_permission: {
        Args: { p_permission: string };
        Returns: boolean;
      };
      invitation_by_token: {
        Args: { p_token: string };
        Returns: {
          attending_count: number;
          city_name: string;
          end_date: string;
          event_title: string;
          event_type: string;
          guest_name: string;
          hosts_text: string;
          invitation_message: string;
          party_size: number;
          rsvp_note: string;
          rsvp_open: boolean;
          rsvp_status: Database["public"]["Enums"]["rsvp_status"];
          start_date: string;
          venue_text: string;
        }[];
      };
      invite_event_member: {
        Args: {
          p_email: string;
          p_event_id: string;
          p_role: Database["public"]["Enums"]["event_role"];
        };
        Returns: string;
      };
      is_org_member: { Args: { p_organization_id: string }; Returns: boolean };
      is_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      listing_availability: {
        Args: { p_from: string; p_service_id: string; p_to: string };
        Returns: {
          auspicious: boolean;
          day: string;
          status: string;
          surcharge_bps: number;
        }[];
      };
      mark_guests_invited: { Args: { p_guest_ids: string[] }; Returns: number };
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number };
      mark_online_payment_failed: {
        Args: { p_order_id: string };
        Returns: undefined;
      };
      my_access: { Args: Record<PropertyKey, never>; Returns: Json };
      my_event_invitations: {
        Args: Record<PropertyKey, never>;
        Returns: {
          event_id: string;
          event_title: string;
          expires_at: string;
          id: string;
          invited_by_name: string;
          role: Database["public"]["Enums"]["event_role"];
          start_date: string;
        }[];
      };
      my_invitations: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          expires_at: string;
          id: string;
          organization_id: string;
          organization_name: string;
          role: Database["public"]["Enums"]["org_role"];
        }[];
      };
      my_jobs: {
        Args: { p_from?: string; p_to?: string };
        Returns: {
          assignment_id: string;
          call_time: string;
          customer_name: string;
          customer_phone: string;
          ends_at: string;
          guests: number;
          instructions: string;
          job_cancelled: boolean;
          job_id: string;
          organization_name: string;
          pay_paise: number;
          role_label: string;
          site: string;
          staff_note: string;
          starts_at: string;
          status: Database["public"]["Enums"]["job_assignment_status"];
          title: string;
        }[];
      };
      org_member_directory: {
        Args: { p_organization_id: string };
        Returns: {
          branch_ids: string[];
          created_at: string;
          display_name: string;
          email: string;
          full_name: string;
          member_id: string;
          role: Database["public"]["Enums"]["org_role"];
          status: Database["public"]["Enums"]["member_status"];
          user_id: string;
        }[];
      };
      payment_receipt: { Args: { p_payment_id: string }; Returns: Json };
      post_enquiry_message: {
        Args: { p_body: string; p_enquiry_id: string };
        Returns: string;
      };
      record_offline_payment: {
        Args: {
          p_amount_paise: number;
          p_booking_item_id: string;
          p_idempotency_key: string;
          p_mode: Database["public"]["Enums"]["offline_payment_mode"];
          p_note: string;
          p_reference: string;
        };
        Returns: string;
      };
      release_expired_holds: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      release_reservation: {
        Args: {
          p_cancel?: boolean;
          p_reason?: string;
          p_reservation_id: string;
        };
        Returns: {
          allocation_mode: Database["public"]["Enums"]["allocation_mode"];
          blocked_period: unknown;
          booking_item_id: string | null;
          created_at: string;
          created_by: string | null;
          hold_expires_at: string | null;
          id: string;
          idempotency_key: string | null;
          notes: string | null;
          organization_id: string;
          period: unknown;
          quantity: number;
          released_at: string | null;
          resource_id: string;
          source: Database["public"]["Enums"]["reservation_source"];
          status: Database["public"]["Enums"]["reservation_status"];
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "resource_reservations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      remove_event_member: {
        Args: { p_event_id: string; p_user_id: string };
        Returns: undefined;
      };
      reserve_resource: {
        Args: {
          p_ends_at: string;
          p_hold_minutes?: number;
          p_idempotency_key?: string;
          p_notes?: string;
          p_quantity?: number;
          p_resource_id: string;
          p_source: Database["public"]["Enums"]["reservation_source"];
          p_starts_at: string;
          p_status: Database["public"]["Enums"]["reservation_status"];
        };
        Returns: {
          allocation_mode: Database["public"]["Enums"]["allocation_mode"];
          blocked_period: unknown;
          booking_item_id: string | null;
          created_at: string;
          created_by: string | null;
          hold_expires_at: string | null;
          id: string;
          idempotency_key: string | null;
          notes: string | null;
          organization_id: string;
          period: unknown;
          quantity: number;
          released_at: string | null;
          resource_id: string;
          source: Database["public"]["Enums"]["reservation_source"];
          status: Database["public"]["Enums"]["reservation_status"];
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "resource_reservations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      respond_event_invitation: {
        Args: { p_accept: boolean; p_invitation_id: string };
        Returns: string;
      };
      respond_invitation: {
        Args: { p_accept: boolean; p_invitation_id: string };
        Returns: string;
      };
      respond_job: {
        Args: { p_action: string; p_assignment_id: string; p_note?: string };
        Returns: Database["public"]["Enums"]["job_assignment_status"];
      };
      respond_quotation: {
        Args: { p_accept: boolean; p_quotation_id: string };
        Returns: undefined;
      };
      respond_rsvp: {
        Args: {
          p_count: number;
          p_note: string;
          p_status: Database["public"]["Enums"]["rsvp_status"];
          p_token: string;
        };
        Returns: undefined;
      };
      review_business_document: {
        Args: { p_approve: boolean; p_document_id: string; p_reason?: string };
        Returns: {
          created_at: string;
          document_type: Database["public"]["Enums"]["business_document_type"];
          expires_on: string | null;
          file_name: string;
          id: string;
          mime_type: string;
          organization_id: string;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          size_bytes: number;
          status: Database["public"]["Enums"]["document_status"];
          storage_path: string;
          updated_at: string;
          uploaded_by: string;
        };
        SetofOptions: {
          from: "*";
          to: "business_documents";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      revoke_event_invitation: {
        Args: { p_invitation_id: string };
        Returns: undefined;
      };
      revoke_invitation: {
        Args: { p_invitation_id: string };
        Returns: undefined;
      };
      search_listings: {
        Args: {
          p_category?: string;
          p_city?: string;
          p_guests?: number;
          p_limit?: number;
          p_max_price_paise?: number;
          p_offset?: number;
          p_query?: string;
          p_service_category?: string;
          p_sort?: string;
        };
        Returns: {
          area_name: string;
          base_price_paise: number;
          booking_mode: Database["public"]["Enums"]["booking_mode"];
          business_category_icon: string;
          business_category_name: string;
          business_category_slug: string;
          city_name: string;
          cover_path: string;
          currency: string;
          id: string;
          max_capacity: number;
          max_price_paise: number;
          organization_name: string;
          price_type: Database["public"]["Enums"]["price_type"];
          price_unit: Database["public"]["Enums"]["price_unit"];
          service_category_name: string;
          service_category_slug: string;
          slug: string;
          summary: string;
          title: string;
          total_count: number;
          veg_price_per_plate_paise: number;
          verified: boolean;
        }[];
      };
      send_quotation: {
        Args: {
          p_discount_paise: number;
          p_enquiry_id: string;
          p_items: Json;
          p_notes: string;
          p_tax_bps: number;
          p_terms: string;
          p_valid_hours: number;
        };
        Returns: string;
      };
      set_enquiry_event: {
        Args: { p_enquiry_id: string; p_event_id: string };
        Returns: undefined;
      };
      set_event_status: {
        Args: {
          p_event_id: string;
          p_status: Database["public"]["Enums"]["event_status"];
        };
        Returns: undefined;
      };
      set_organization_status: {
        Args: { p_action: string; p_organization_id: string; p_reason?: string };
        Returns: Database["public"]["Enums"]["organization_status"];
      };
      set_organization_verification: {
        Args: {
          p_organization_id: string;
          p_reason?: string;
          p_status: Database["public"]["Enums"]["verification_status"];
        };
        Returns: {
          created_at: string;
          created_by: string;
          id: string;
          idempotency_key: string | null;
          legal_name: string | null;
          name: string;
          primary_business_category_id: string | null;
          primary_city_id: string | null;
          slug: string;
          status: Database["public"]["Enums"]["organization_status"];
          status_changed_at: string | null;
          status_changed_by: string | null;
          status_reason: string | null;
          updated_at: string;
          verification_status: Database["public"]["Enums"]["verification_status"];
          verified_at: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "organizations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_user_block: {
        Args: { p_block: boolean; p_reason?: string; p_user_id: string };
        Returns: undefined;
      };
      set_whatsapp_consent: {
        Args: { p_granted: boolean; p_user_agent?: string };
        Returns: undefined;
      };
      settle_online_refund: {
        Args: { p_razorpay_refund_id: string; p_success: boolean };
        Returns: undefined;
      };
      start_payment: {
        Args: { p_booking_item_id: string };
        Returns: {
          amount_paise: number;
          currency: string;
          kind: string;
          payment_id: string;
          razorpay_order_id: string;
        }[];
      };
      unassign_staff: { Args: { p_assignment_id: string }; Returns: undefined };
      update_assignment: {
        Args: {
          p_assignment_id: string;
          p_call_time: string;
          p_pay_paise: number;
          p_role_label: string;
        };
        Returns: undefined;
      };
      vendor_report: {
        Args: { p_from: string; p_organization_id: string; p_to: string };
        Returns: Json;
      };
      withdraw_quotation: {
        Args: { p_quotation_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      allocation_mode: "exclusive" | "capacity";
      app_locale: "en" | "kn" | "hi";
      booking_item_status: "pending_payment" | "confirmed" | "cancelled" | "expired";
      booking_mode: "instant" | "request";
      budget_unit: "per_guest" | "per_event";
      business_document_type:
        | "gst_certificate"
        | "pan_card"
        | "trade_license"
        | "fssai_license"
        | "fire_noc"
        | "shop_establishment"
        | "cancelled_cheque"
        | "identity_proof"
        | "other";
      cancellation_policy: "flexible" | "moderate" | "strict";
      consent_purpose: "transactional" | "marketing" | "whatsapp_updates" | "terms" | "privacy";
      delivery_status: "queued" | "sent" | "failed" | "skipped";
      document_status: "uploaded" | "under_review" | "approved" | "rejected" | "expired";
      enquiry_status: "open" | "quoted" | "accepted" | "reserved" | "declined" | "cancelled" | "expired" | "booked";
      event_role: "owner" | "cohost" | "viewer";
      event_status: "planning" | "completed" | "cancelled";
      expense_category:
        | "staff_payout"
        | "materials"
        | "food_supplies"
        | "decor_supplies"
        | "transport"
        | "rent"
        | "utilities"
        | "equipment"
        | "marketing"
        | "fees"
        | "other";
      invitation_status: "pending" | "accepted" | "declined" | "revoked" | "expired";
      job_assignment_status: "assigned" | "accepted" | "declined" | "checked_in" | "completed" | "cancelled";
      member_status: "invited" | "active" | "suspended" | "removed";
      notification_channel: "email" | "sms" | "whatsapp" | "push" | "in_app";
      offline_payment_mode: "cash" | "upi" | "bank_transfer" | "cheque";
      org_role: "owner" | "branch_manager" | "staff";
      organization_status: "draft" | "pending_review" | "active" | "suspended" | "closed";
      outside_policy: "in_house_only" | "outside_allowed" | "both";
      payment_method: "razorpay" | "offline";
      payment_status: "created" | "paid" | "failed";
      policy_type: "terms_of_service" | "privacy_policy" | "vendor_agreement" | "cancellation_policy" | "refund_policy";
      price_type: "fixed" | "starting_from" | "range" | "on_request";
      price_unit: "per_event" | "per_day" | "per_plate" | "per_person" | "per_hour" | "per_session";
      quotation_status: "sent" | "accepted" | "declined" | "expired" | "withdrawn" | "superseded";
      refund_status: "pending" | "processing" | "processed" | "failed";
      reservation_source: "platform" | "offline" | "manual_block";
      reservation_status: "hold" | "confirmed" | "blocked" | "released" | "cancelled";
      resource_kind: "venue_space" | "artist" | "team" | "equipment";
      role_scope: "platform" | "organization";
      rsvp_status: "pending" | "attending" | "maybe" | "declined";
      service_status: "draft" | "published" | "paused" | "archived";
      verification_status: "unverified" | "pending" | "verified" | "rejected";
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
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
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
      allocation_mode: ["exclusive", "capacity"],
      app_locale: ["en", "kn", "hi"],
      booking_item_status: ["pending_payment", "confirmed", "cancelled", "expired"],
      booking_mode: ["instant", "request"],
      budget_unit: ["per_guest", "per_event"],
      business_document_type: [
        "gst_certificate",
        "pan_card",
        "trade_license",
        "fssai_license",
        "fire_noc",
        "shop_establishment",
        "cancelled_cheque",
        "identity_proof",
        "other",
      ],
      cancellation_policy: ["flexible", "moderate", "strict"],
      consent_purpose: ["transactional", "marketing", "whatsapp_updates", "terms", "privacy"],
      delivery_status: ["queued", "sent", "failed", "skipped"],
      document_status: ["uploaded", "under_review", "approved", "rejected", "expired"],
      enquiry_status: ["open", "quoted", "accepted", "reserved", "declined", "cancelled", "expired", "booked"],
      event_role: ["owner", "cohost", "viewer"],
      event_status: ["planning", "completed", "cancelled"],
      expense_category: [
        "staff_payout",
        "materials",
        "food_supplies",
        "decor_supplies",
        "transport",
        "rent",
        "utilities",
        "equipment",
        "marketing",
        "fees",
        "other",
      ],
      invitation_status: ["pending", "accepted", "declined", "revoked", "expired"],
      job_assignment_status: ["assigned", "accepted", "declined", "checked_in", "completed", "cancelled"],
      member_status: ["invited", "active", "suspended", "removed"],
      notification_channel: ["email", "sms", "whatsapp", "push", "in_app"],
      offline_payment_mode: ["cash", "upi", "bank_transfer", "cheque"],
      org_role: ["owner", "branch_manager", "staff"],
      organization_status: ["draft", "pending_review", "active", "suspended", "closed"],
      outside_policy: ["in_house_only", "outside_allowed", "both"],
      payment_method: ["razorpay", "offline"],
      payment_status: ["created", "paid", "failed"],
      policy_type: ["terms_of_service", "privacy_policy", "vendor_agreement", "cancellation_policy", "refund_policy"],
      price_type: ["fixed", "starting_from", "range", "on_request"],
      price_unit: ["per_event", "per_day", "per_plate", "per_person", "per_hour", "per_session"],
      quotation_status: ["sent", "accepted", "declined", "expired", "withdrawn", "superseded"],
      refund_status: ["pending", "processing", "processed", "failed"],
      reservation_source: ["platform", "offline", "manual_block"],
      reservation_status: ["hold", "confirmed", "blocked", "released", "cancelled"],
      resource_kind: ["venue_space", "artist", "team", "equipment"],
      role_scope: ["platform", "organization"],
      rsvp_status: ["pending", "attending", "maybe", "declined"],
      service_status: ["draft", "published", "paused", "archived"],
      verification_status: ["unverified", "pending", "verified", "rejected"],
    },
  },
} as const;
