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
      app_settings: {
        Row: {
          auto_cleanup: boolean
          created_at: string
          default_format: string | null
          default_quality: string | null
          id: string
          storage_location: string | null
          updated_at: string
        }
        Insert: {
          auto_cleanup?: boolean
          created_at?: string
          default_format?: string | null
          default_quality?: string | null
          id?: string
          storage_location?: string | null
          updated_at?: string
        }
        Update: {
          auto_cleanup?: boolean
          created_at?: string
          default_format?: string | null
          default_quality?: string | null
          id?: string
          storage_location?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      brand_settings: {
        Row: {
          created_at: string
          font: string | null
          id: string
          logo_url: string | null
          page_name: string | null
          primary_color: string | null
          secondary_color: string | null
          updated_at: string
          watermark_enabled: boolean
          watermark_position: Database["public"]["Enums"]["watermark_position"]
        }
        Insert: {
          created_at?: string
          font?: string | null
          id?: string
          logo_url?: string | null
          page_name?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
          watermark_enabled?: boolean
          watermark_position?: Database["public"]["Enums"]["watermark_position"]
        }
        Update: {
          created_at?: string
          font?: string | null
          id?: string
          logo_url?: string | null
          page_name?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
          watermark_enabled?: boolean
          watermark_position?: Database["public"]["Enums"]["watermark_position"]
        }
        Relationships: []
      }
      edits: {
        Row: {
          aspect_ratio: string
          created_at: string
          doc: Json
          id: string
          name: string | null
          owner_user_id: string
          project_id: string | null
          queue_id: string | null
          status: Database["public"]["Enums"]["edit_status"]
          template_id: string | null
          template_url: string | null
          updated_at: string
          user_id: string
          video_filename: string | null
          video_id: string | null
          video_storage_path: string | null
          video_url: string | null
        }
        Insert: {
          aspect_ratio?: string
          created_at?: string
          doc?: Json
          id?: string
          name?: string | null
          owner_user_id?: string
          project_id?: string | null
          queue_id?: string | null
          status?: Database["public"]["Enums"]["edit_status"]
          template_id?: string | null
          template_url?: string | null
          updated_at?: string
          user_id?: string
          video_filename?: string | null
          video_id?: string | null
          video_storage_path?: string | null
          video_url?: string | null
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          doc?: Json
          id?: string
          name?: string | null
          owner_user_id?: string
          project_id?: string | null
          queue_id?: string | null
          status?: Database["public"]["Enums"]["edit_status"]
          template_id?: string | null
          template_url?: string | null
          updated_at?: string
          user_id?: string
          video_filename?: string | null
          video_id?: string | null
          video_storage_path?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edits_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "processing_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edits_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edits_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_credentials: {
        Row: {
          access_token: string
          account: string
          created_at: string
          id: string
          ig_business_id: string
          last_validated_at: string | null
          last_validation_detail: string | null
          last_validation_status: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          account: string
          created_at?: string
          id?: string
          ig_business_id: string
          last_validated_at?: string | null
          last_validation_detail?: string | null
          last_validation_status?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          account?: string
          created_at?: string
          id?: string
          ig_business_id?: string
          last_validated_at?: string | null
          last_validation_detail?: string | null
          last_validation_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      instagram_posts: {
        Row: {
          account: string
          caption: string
          container_id: string | null
          created_at: string
          error_message: string | null
          hashtags: string
          id: string
          logs: Json
          publish_id: string | null
          published_at: string | null
          scheduled_at: string | null
          status: string
          thumbnail_url: string | null
          updated_at: string
          video_id: string | null
          video_url: string | null
        }
        Insert: {
          account: string
          caption?: string
          container_id?: string | null
          created_at?: string
          error_message?: string | null
          hashtags?: string
          id?: string
          logs?: Json
          publish_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          video_id?: string | null
          video_url?: string | null
        }
        Update: {
          account?: string
          caption?: string
          container_id?: string | null
          created_at?: string
          error_message?: string | null
          hashtags?: string
          id?: string
          logs?: Json
          publish_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          video_id?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_posts_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_queue: {
        Row: {
          brand_id: string | null
          created_at: string
          error: string | null
          id: string
          options: Json
          progress: number
          project_id: string | null
          status: Database["public"]["Enums"]["queue_status"]
          template_id: string | null
          updated_at: string
          video_id: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          options?: Json
          progress?: number
          project_id?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          template_id?: string | null
          updated_at?: string
          video_id?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          options?: Json
          progress?: number
          project_id?: string | null
          status?: Database["public"]["Enums"]["queue_status"]
          template_id?: string | null
          updated_at?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processing_queue_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_queue_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_queue_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_queue_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          category: Database["public"]["Enums"]["project_category"]
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["project_category"]
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["project_category"]
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      publish_schedules: {
        Row: {
          account: string
          category: string | null
          created_at: string
          id: string
          posts_per_day: number
          times: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          account: string
          category?: string | null
          created_at?: string
          id?: string
          posts_per_day?: number
          times?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          account?: string
          category?: string | null
          created_at?: string
          id?: string
          posts_per_day?: number
          times?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      render_jobs: {
        Row: {
          completed_at: string | null
          composition: Json
          created_at: string
          edit_id: string | null
          error: string | null
          external_job_id: string | null
          id: string
          output_path: string | null
          output_url: string | null
          progress: number
          project_id: string | null
          provider: string
          started_at: string | null
          status: Database["public"]["Enums"]["render_job_status"]
          updated_at: string
          user_id: string | null
          video_id: string | null
        }
        Insert: {
          completed_at?: string | null
          composition?: Json
          created_at?: string
          edit_id?: string | null
          error?: string | null
          external_job_id?: string | null
          id?: string
          output_path?: string | null
          output_url?: string | null
          progress?: number
          project_id?: string | null
          provider?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["render_job_status"]
          updated_at?: string
          user_id?: string | null
          video_id?: string | null
        }
        Update: {
          completed_at?: string | null
          composition?: Json
          created_at?: string
          edit_id?: string | null
          error?: string | null
          external_job_id?: string | null
          id?: string
          output_path?: string | null
          output_url?: string | null
          progress?: number
          project_id?: string | null
          provider?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["render_job_status"]
          updated_at?: string
          user_id?: string | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_edit_id_fkey"
            columns: ["edit_id"]
            isOneToOne: false
            referencedRelation: "edits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          file_path: string | null
          file_type: string | null
          id: string
          is_builtin: boolean
          name: string
          preview_url: string | null
          project_id: string | null
          settings: Json
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_path?: string | null
          file_type?: string | null
          id?: string
          is_builtin?: boolean
          name: string
          preview_url?: string | null
          project_id?: string | null
          settings?: Json
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_path?: string | null
          file_type?: string | null
          id?: string
          is_builtin?: boolean
          name?: string
          preview_url?: string | null
          project_id?: string | null
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          created_at: string
          duration_seconds: number | null
          file_hash: string | null
          filename: string
          id: string
          mime_type: string | null
          original_path: string | null
          original_url: string | null
          processed_path: string | null
          processed_url: string | null
          progress: number
          project_id: string | null
          size_bytes: number | null
          status: Database["public"]["Enums"]["video_status"]
          template_id: string | null
          thumbnail_path: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          file_hash?: string | null
          filename: string
          id?: string
          mime_type?: string | null
          original_path?: string | null
          original_url?: string | null
          processed_path?: string | null
          processed_url?: string | null
          progress?: number
          project_id?: string | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["video_status"]
          template_id?: string | null
          thumbnail_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          file_hash?: string | null
          filename?: string
          id?: string
          mime_type?: string | null
          original_path?: string | null
          original_url?: string | null
          processed_path?: string | null
          processed_url?: string | null
          progress?: number
          project_id?: string | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["video_status"]
          template_id?: string | null
          thumbnail_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      edit_status: "draft" | "editing" | "processing" | "completed" | "failed"
      project_category:
        | "motivacao"
        | "dinheiro"
        | "curiosidades"
        | "luxo"
        | "saude"
        | "futebol"
        | "noticias"
        | "celebridades"
        | "outro"
      queue_status: "pending" | "processing" | "done" | "error"
      render_job_status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED"
      video_status:
        | "uploaded"
        | "queued"
        | "processing"
        | "finished"
        | "error"
        | "pending"
        | "uploading"
        | "completed"
        | "failed"
        | "in_editing"
        | "published"
      watermark_position:
        | "top-left"
        | "top-right"
        | "bottom-left"
        | "bottom-right"
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
      edit_status: ["draft", "editing", "processing", "completed", "failed"],
      project_category: [
        "motivacao",
        "dinheiro",
        "curiosidades",
        "luxo",
        "saude",
        "futebol",
        "noticias",
        "celebridades",
        "outro",
      ],
      queue_status: ["pending", "processing", "done", "error"],
      render_job_status: ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"],
      video_status: [
        "uploaded",
        "queued",
        "processing",
        "finished",
        "error",
        "pending",
        "uploading",
        "completed",
        "failed",
        "in_editing",
        "published",
      ],
      watermark_position: [
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
      ],
    },
  },
} as const
