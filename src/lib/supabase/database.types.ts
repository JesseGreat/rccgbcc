// Database types for supabase-js, in the same shape `supabase gen types typescript`
// produces. Regenerate after schema changes with:
//   pnpm dlx supabase gen types typescript --project-id <ref> --schema public > src/lib/supabase/database.types.ts
// (then re-apply nothing: this file has no hand-written additions; payload types
// for jsonb RPC results live in src/lib/db/types.ts).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          church_name: string;
          id: number;
          max_marks_per_device: number;
          service_dow: number;
          timezone: string;
          updated_at: string;
          window_end: string;
          window_start: string;
        };
        Insert: {
          church_name?: string;
          id?: number;
          max_marks_per_device?: number;
          service_dow?: number;
          timezone?: string;
          updated_at?: string;
          window_end?: string;
          window_start?: string;
        };
        Update: {
          church_name?: string;
          id?: number;
          max_marks_per_device?: number;
          service_dow?: number;
          timezone?: string;
          updated_at?: string;
          window_end?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      attendance: {
        Row: {
          class_id: string;
          device_hash: string | null;
          id: string;
          marked_at: string;
          service_date: string;
          source: "self" | "teacher" | "admin";
          student_id: string;
        };
        Insert: {
          class_id: string;
          device_hash?: string | null;
          id?: string;
          marked_at?: string;
          service_date?: string;
          source?: "self" | "teacher" | "admin";
          student_id: string;
        };
        Update: {
          class_id?: string;
          device_hash?: string | null;
          id?: string;
          marked_at?: string;
          service_date?: string;
          source?: "self" | "teacher" | "admin";
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          details: Json;
          entity: string;
          entity_id: string | null;
          id: number;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          entity: string;
          entity_id?: string | null;
          id?: never;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          entity?: string;
          entity_id?: string | null;
          id?: never;
        };
        Relationships: [];
      };
      classes: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          class_id: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          is_active: boolean;
          role: "super_admin" | "teacher";
        };
        Insert: {
          class_id?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id: string;
          is_active?: boolean;
          role: "super_admin" | "teacher";
        };
        Update: {
          class_id?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          role?: "super_admin" | "teacher";
        };
        Relationships: [
          {
            foreignKeyName: "profiles_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
        ];
      };
      rate_limits: {
        Row: {
          bucket: string;
          hits: number;
          key: string;
        };
        Insert: {
          bucket: string;
          hits?: number;
          key: string;
        };
        Update: {
          bucket?: string;
          hits?: number;
          key?: string;
        };
        Relationships: [];
      };
      student_flags: {
        Row: {
          class_id: string;
          created_at: string;
          flagged_by: string | null;
          id: string;
          reason: string;
          resolved_at: string | null;
          resolved_by: string | null;
          status: "open" | "resolved" | "dismissed";
          student_id: string;
        };
        Insert: {
          class_id: string;
          created_at?: string;
          flagged_by?: string | null;
          id?: string;
          reason: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: "open" | "resolved" | "dismissed";
          student_id: string;
        };
        Update: {
          class_id?: string;
          created_at?: string;
          flagged_by?: string | null;
          id?: string;
          reason?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: "open" | "resolved" | "dismissed";
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_flags_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_flags_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      students: {
        Row: {
          age_group: string | null;
          class_id: string;
          created_at: string;
          created_by: string;
          full_name: string;
          gender: string | null;
          id: string;
          is_active: boolean;
          normalized_name: string;
          phone: string | null;
        };
        Insert: {
          age_group?: string | null;
          class_id: string;
          created_at?: string;
          created_by?: string;
          full_name: string;
          gender?: string | null;
          id?: string;
          is_active?: boolean;
          normalized_name?: never;
          phone?: string | null;
        };
        Update: {
          age_group?: string | null;
          class_id?: string;
          created_at?: string;
          created_by?: string;
          full_name?: string;
          gender?: string | null;
          id?: string;
          is_active?: boolean;
          normalized_name?: never;
          phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      student_first_attendance: {
        Row: {
          class_id: string;
          first_service_date: string;
          student_id: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      add_student: {
        Args: {
          p_class_id: string;
          p_device_hash?: string;
          p_force?: boolean;
          p_full_name: string;
          p_phone?: string;
        };
        Returns: Json;
      };
      attendance_window_state: { Args: never; Returns: Json };
      current_profile_class_id: { Args: never; Returns: string };
      current_profile_role: { Args: never; Returns: string };
      current_service_date: { Args: never; Returns: string };
      get_classes: { Args: never; Returns: Json };
      hit_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number };
        Returns: Json;
      };
      is_attendance_open: { Args: never; Returns: boolean };
      is_super_admin: { Args: never; Returns: boolean };
      is_teacher: { Args: never; Returns: boolean };
      mark_attendance: {
        Args: { p_device_hash: string; p_student_id: string };
        Returns: Json;
      };
      merge_students: {
        Args: { p_keep_id: string; p_remove_id: string };
        Returns: Json;
      };
      search_students: {
        Args: { p_class_id: string; p_query: string };
        Returns: {
          already_marked_today: boolean;
          full_name: string;
          id: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
