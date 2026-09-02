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
      connection_health: {
        Row: {
          account_ref: string
          created_at: string
          error_code: string | null
          error_reason: string | null
          expires_at: string | null
          id: string
          last_check: string | null
          metadata: Json
          platform: Database["public"]["Enums"]["publish_platform"]
          project_id: string | null
          status: Database["public"]["Enums"]["connection_health_status"]
          updated_at: string
        }
        Insert: {
          account_ref: string
          created_at?: string
          error_code?: string | null
          error_reason?: string | null
          expires_at?: string | null
          id?: string
          last_check?: string | null
          metadata?: Json
          platform: Database["public"]["Enums"]["publish_platform"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["connection_health_status"]
          updated_at?: string
        }
        Update: {
          account_ref?: string
          created_at?: string
          error_code?: string | null
          error_reason?: string | null
          expires_at?: string | null
          id?: string
          last_check?: string | null
          metadata?: Json
          platform?: Database["public"]["Enums"]["publish_platform"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["connection_health_status"]
          updated_at?: string
        }
        Relationships: []
      }
      edits: {
        Row: {
          aspect_ratio: string
          created_at: string
          doc: Json
          doc_overridden: boolean
          id: string
          name: string | null
          output_video_id: string | null
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
          doc_overridden?: boolean
          id?: string
          name?: string | null
          output_video_id?: string | null
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
          doc_overridden?: boolean
          id?: string
          name?: string | null
          output_video_id?: string | null
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
            foreignKeyName: "edits_output_video_id_fkey"
            columns: ["output_video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
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
      facebook_accounts: {
        Row: {
          connected_at: string
          connection_logs: Json
          connection_status: string
          created_at: string
          id: string
          page_access_token: string
          page_id: string
          page_name: string
          page_picture: string | null
          project_id: string | null
          token_checked_at: string | null
          token_error: string | null
          updated_at: string
          user_access_token: string | null
        }
        Insert: {
          connected_at?: string
          connection_logs?: Json
          connection_status?: string
          created_at?: string
          id?: string
          page_access_token: string
          page_id: string
          page_name: string
          page_picture?: string | null
          project_id?: string | null
          token_checked_at?: string | null
          token_error?: string | null
          updated_at?: string
          user_access_token?: string | null
        }
        Update: {
          connected_at?: string
          connection_logs?: Json
          connection_status?: string
          created_at?: string
          id?: string
          page_access_token?: string
          page_id?: string
          page_name?: string
          page_picture?: string | null
          project_id?: string | null
          token_checked_at?: string | null
          token_error?: string | null
          updated_at?: string
          user_access_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facebook_accounts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_posts: {
        Row: {
          created_at: string
          description: string
          error_message: string | null
          facebook_account_id: string | null
          fb_post_id: string | null
          fb_video_id: string | null
          id: string
          logs: Json
          meta_response: Json | null
          page_id: string
          page_name: string | null
          project_id: string | null
          published_at: string | null
          scheduled_at: string | null
          status: string
          thumbnail_url: string | null
          updated_at: string
          video_id: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string
          error_message?: string | null
          facebook_account_id?: string | null
          fb_post_id?: string | null
          fb_video_id?: string | null
          id?: string
          logs?: Json
          meta_response?: Json | null
          page_id: string
          page_name?: string | null
          project_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          video_id?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          error_message?: string | null
          facebook_account_id?: string | null
          fb_post_id?: string | null
          fb_video_id?: string | null
          id?: string
          logs?: Json
          meta_response?: Json | null
          page_id?: string
          page_name?: string | null
          project_id?: string | null
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
            foreignKeyName: "facebook_posts_facebook_account_id_fkey"
            columns: ["facebook_account_id"]
            isOneToOne: false
            referencedRelation: "facebook_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facebook_posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facebook_posts_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_account_locks: {
        Row: {
          cooldown_until: string | null
          creation_id: string | null
          ig_business_id: string
          last_error_code: number | null
          locked_at: string
          post_id: string | null
        }
        Insert: {
          cooldown_until?: string | null
          creation_id?: string | null
          ig_business_id: string
          last_error_code?: number | null
          locked_at?: string
          post_id?: string | null
        }
        Update: {
          cooldown_until?: string | null
          creation_id?: string | null
          ig_business_id?: string
          last_error_code?: number | null
          locked_at?: string
          post_id?: string | null
        }
        Relationships: []
      }
      instagram_credentials: {
        Row: {
          access_token: string
          account: string
          connection_status: Database["public"]["Enums"]["instagram_connection_status"]
          created_at: string
          display_name: string | null
          id: string
          ig_business_id: string
          last_validated_at: string | null
          last_validation_detail: string | null
          last_validation_status: string | null
          project_id: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          account: string
          connection_status?: Database["public"]["Enums"]["instagram_connection_status"]
          created_at?: string
          display_name?: string | null
          id?: string
          ig_business_id: string
          last_validated_at?: string | null
          last_validation_detail?: string | null
          last_validation_status?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          account?: string
          connection_status?: Database["public"]["Enums"]["instagram_connection_status"]
          created_at?: string
          display_name?: string | null
          id?: string
          ig_business_id?: string
          last_validated_at?: string | null
          last_validation_detail?: string | null
          last_validation_status?: string | null
          project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_credentials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      instagram_publish_locks: {
        Row: {
          created_at: string
          creation_id: string
          ig_business_id: string | null
          last_request_at: string | null
          polling_started_at: string
          post_id: string | null
          request_count: number
          status: string
        }
        Insert: {
          created_at?: string
          creation_id: string
          ig_business_id?: string | null
          last_request_at?: string | null
          polling_started_at?: string
          post_id?: string | null
          request_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          creation_id?: string
          ig_business_id?: string | null
          last_request_at?: string | null
          polling_started_at?: string
          post_id?: string | null
          request_count?: number
          status?: string
        }
        Relationships: []
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
      project_affiliate_configs: {
        Row: {
          affiliate_link: string
          created_at: string
          id: string
          is_active: boolean
          product_category: string | null
          product_name: string
          project_id: string
          updated_at: string
        }
        Insert: {
          affiliate_link: string
          created_at?: string
          id?: string
          is_active?: boolean
          product_category?: string | null
          product_name: string
          project_id: string
          updated_at?: string
        }
        Update: {
          affiliate_link?: string
          created_at?: string
          id?: string
          is_active?: boolean
          product_category?: string | null
          product_name?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_affiliate_configs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_comment_templates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_used_at: string | null
          position: number
          project_id: string
          template: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          position?: number
          project_id: string
          template: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          position?: number
          project_id?: string
          template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_comment_templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_edit_models: {
        Row: {
          aspect_ratio: string
          created_at: string
          doc: Json
          id: string
          project_id: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          aspect_ratio?: string
          created_at?: string
          doc?: Json
          id?: string
          project_id: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          doc?: Json
          id?: string
          project_id?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_edit_models_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_edit_models_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_schedule_settings: {
        Row: {
          created_at: string
          id: string
          last_scheduled_slot: string | null
          next_available_slot: string | null
          platform: string
          posts_per_day: number
          project_id: string
          publication_times: Json
          start_date: string | null
          start_time: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_scheduled_slot?: string | null
          next_available_slot?: string | null
          platform?: string
          posts_per_day?: number
          project_id: string
          publication_times?: Json
          start_date?: string | null
          start_time?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_scheduled_slot?: string | null
          next_available_slot?: string | null
          platform?: string
          posts_per_day?: number
          project_id?: string
          publication_times?: Json
          start_date?: string | null
          start_time?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_schedule_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      publication_archive: {
        Row: {
          account_ref: string | null
          archived_at: string
          attempt_count: number | null
          caption: string | null
          id: string
          last_error: string | null
          last_error_code: string | null
          metadata: Json | null
          original_created_at: string | null
          original_id: string
          platform: string
          platform_post_id: string | null
          project_id: string | null
          published_at: string | null
          scheduled_at: string | null
          status: string
          video_id: string | null
        }
        Insert: {
          account_ref?: string | null
          archived_at?: string
          attempt_count?: number | null
          caption?: string | null
          id?: string
          last_error?: string | null
          last_error_code?: string | null
          metadata?: Json | null
          original_created_at?: string | null
          original_id: string
          platform: string
          platform_post_id?: string | null
          project_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status: string
          video_id?: string | null
        }
        Update: {
          account_ref?: string | null
          archived_at?: string
          attempt_count?: number | null
          caption?: string | null
          id?: string
          last_error?: string | null
          last_error_code?: string | null
          metadata?: Json | null
          original_created_at?: string | null
          original_id?: string
          platform?: string
          platform_post_id?: string | null
          project_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          video_id?: string | null
        }
        Relationships: []
      }
      publish_events: {
        Row: {
          created_at: string
          detail: Json | null
          event: string
          id: string
          platform: string
          status: string | null
          target_id: string | null
          video_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          event: string
          id?: string
          platform: string
          status?: string | null
          target_id?: string | null
          video_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json | null
          event?: string
          id?: string
          platform?: string
          status?: string | null
          target_id?: string | null
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publish_events_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "publish_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_queue: {
        Row: {
          account_ref: string | null
          attempt_count: number
          caption: string | null
          created_at: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          last_error_code: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          metadata: Json
          next_attempt_at: string | null
          platform: Database["public"]["Enums"]["publish_platform"]
          platform_post_id: string | null
          project_id: string | null
          published_at: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["publish_queue_status"]
          updated_at: string
          video_id: string | null
        }
        Insert: {
          account_ref?: string | null
          attempt_count?: number
          caption?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_error_code?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          metadata?: Json
          next_attempt_at?: string | null
          platform: Database["public"]["Enums"]["publish_platform"]
          platform_post_id?: string | null
          project_id?: string | null
          published_at?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["publish_queue_status"]
          updated_at?: string
          video_id?: string | null
        }
        Update: {
          account_ref?: string | null
          attempt_count?: number
          caption?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_error_code?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          metadata?: Json
          next_attempt_at?: string | null
          platform?: Database["public"]["Enums"]["publish_platform"]
          platform_post_id?: string | null
          project_id?: string | null
          published_at?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["publish_queue_status"]
          updated_at?: string
          video_id?: string | null
        }
        Relationships: []
      }
      publish_schedules: {
        Row: {
          account: string
          category: string | null
          created_at: string
          id: string
          network: string
          posts_per_day: number
          sequence_start_at: string | null
          times: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          account: string
          category?: string | null
          created_at?: string
          id?: string
          network?: string
          posts_per_day?: number
          sequence_start_at?: string | null
          times?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          account?: string
          category?: string | null
          created_at?: string
          id?: string
          network?: string
          posts_per_day?: number
          sequence_start_at?: string | null
          times?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      publish_schedules_multi: {
        Row: {
          created_at: string
          id: string
          instagram_post_id: string | null
          networks: string[]
          scheduled_at: string
          tiktok_post_id: string | null
          video_id: string | null
          youtube_post_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          instagram_post_id?: string | null
          networks?: string[]
          scheduled_at: string
          tiktok_post_id?: string | null
          video_id?: string | null
          youtube_post_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          instagram_post_id?: string | null
          networks?: string[]
          scheduled_at?: string
          tiktok_post_id?: string | null
          video_id?: string | null
          youtube_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publish_schedules_multi_instagram_post_id_fkey"
            columns: ["instagram_post_id"]
            isOneToOne: false
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_schedules_multi_tiktok_post_id_fkey"
            columns: ["tiktok_post_id"]
            isOneToOne: false
            referencedRelation: "tiktok_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_schedules_multi_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_schedules_multi_youtube_post_id_fkey"
            columns: ["youtube_post_id"]
            isOneToOne: false
            referencedRelation: "youtube_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_targets: {
        Row: {
          account: string | null
          created_at: string
          error_message: string | null
          facebook_post_id: string | null
          id: string
          instagram_post_id: string | null
          platform: string
          published_at: string | null
          scheduled_at: string | null
          status: string
          tiktok_post_id: string | null
          updated_at: string
          video_id: string | null
          youtube_post_id: string | null
        }
        Insert: {
          account?: string | null
          created_at?: string
          error_message?: string | null
          facebook_post_id?: string | null
          id?: string
          instagram_post_id?: string | null
          platform: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          tiktok_post_id?: string | null
          updated_at?: string
          video_id?: string | null
          youtube_post_id?: string | null
        }
        Update: {
          account?: string | null
          created_at?: string
          error_message?: string | null
          facebook_post_id?: string | null
          id?: string
          instagram_post_id?: string | null
          platform?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          tiktok_post_id?: string | null
          updated_at?: string
          video_id?: string | null
          youtube_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publish_targets_facebook_post_id_fkey"
            columns: ["facebook_post_id"]
            isOneToOne: true
            referencedRelation: "facebook_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_targets_instagram_post_id_fkey"
            columns: ["instagram_post_id"]
            isOneToOne: true
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_targets_tiktok_post_id_fkey"
            columns: ["tiktok_post_id"]
            isOneToOne: true
            referencedRelation: "tiktok_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publish_targets_youtube_post_id_fkey"
            columns: ["youtube_post_id"]
            isOneToOne: true
            referencedRelation: "youtube_posts"
            referencedColumns: ["id"]
          },
        ]
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
      tiktok_credentials: {
        Row: {
          access_token: string | null
          account: string
          created_at: string
          expires_at: string | null
          id: string
          last_validated_at: string | null
          last_validation_detail: string | null
          last_validation_status: string | null
          open_id: string | null
          refresh_expires_at: string | null
          refresh_token: string | null
          scope: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          access_token?: string | null
          account: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_validated_at?: string | null
          last_validation_detail?: string | null
          last_validation_status?: string | null
          open_id?: string | null
          refresh_expires_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          access_token?: string | null
          account?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_validated_at?: string | null
          last_validation_detail?: string | null
          last_validation_status?: string | null
          open_id?: string | null
          refresh_expires_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      tiktok_oauth_states: {
        Row: {
          account: string
          code_verifier: string
          created_at: string
          state: string
        }
        Insert: {
          account: string
          code_verifier: string
          created_at?: string
          state: string
        }
        Update: {
          account?: string
          code_verifier?: string
          created_at?: string
          state?: string
        }
        Relationships: []
      }
      tiktok_posts: {
        Row: {
          account: string
          caption: string
          created_at: string
          error_message: string | null
          id: string
          logs: Json
          publish_id: string | null
          published_at: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
          video_id: string | null
          video_url: string | null
        }
        Insert: {
          account: string
          caption?: string
          created_at?: string
          error_message?: string | null
          id?: string
          logs?: Json
          publish_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          video_id?: string | null
          video_url?: string | null
        }
        Update: {
          account?: string
          caption?: string
          created_at?: string
          error_message?: string | null
          id?: string
          logs?: Json
          publish_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          video_id?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tiktok_posts_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_ai_cache: {
        Row: {
          analysis: Json | null
          cache_key: string
          caption: string | null
          created_at: string
          cta: string | null
          hashtags: Json | null
          id: string
          model: string | null
          niche: string | null
          objects: string[] | null
          ocr: string[] | null
          summary: string | null
          title: string | null
          updated_at: string
          video_id: string | null
        }
        Insert: {
          analysis?: Json | null
          cache_key: string
          caption?: string | null
          created_at?: string
          cta?: string | null
          hashtags?: Json | null
          id?: string
          model?: string | null
          niche?: string | null
          objects?: string[] | null
          ocr?: string[] | null
          summary?: string | null
          title?: string | null
          updated_at?: string
          video_id?: string | null
        }
        Update: {
          analysis?: Json | null
          cache_key?: string
          caption?: string | null
          created_at?: string
          cta?: string | null
          hashtags?: Json | null
          id?: string
          model?: string | null
          niche?: string | null
          objects?: string[] | null
          ocr?: string[] | null
          summary?: string | null
          title?: string | null
          updated_at?: string
          video_id?: string | null
        }
        Relationships: []
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
      youtube_credentials: {
        Row: {
          access_token: string
          account: string
          channel_id: string | null
          channel_title: string | null
          created_at: string
          expires_at: string | null
          id: string
          label: string | null
          last_validated_at: string | null
          last_validation_detail: string | null
          last_validation_status: string | null
          project_id: string | null
          refresh_token: string | null
          scope: string | null
          status: string
          thumbnail: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_token: string
          account?: string
          channel_id?: string | null
          channel_title?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          label?: string | null
          last_validated_at?: string | null
          last_validation_detail?: string | null
          last_validation_status?: string | null
          project_id?: string | null
          refresh_token?: string | null
          scope?: string | null
          status?: string
          thumbnail?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_token?: string
          account?: string
          channel_id?: string | null
          channel_title?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          label?: string | null
          last_validated_at?: string | null
          last_validation_detail?: string | null
          last_validation_status?: string | null
          project_id?: string | null
          refresh_token?: string | null
          scope?: string | null
          status?: string
          thumbnail?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "youtube_credentials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_oauth_states: {
        Row: {
          account: string
          created_at: string
          state: string
        }
        Insert: {
          account?: string
          created_at?: string
          state: string
        }
        Update: {
          account?: string
          created_at?: string
          state?: string
        }
        Relationships: []
      }
      youtube_posts: {
        Row: {
          account: string
          auto_comment_enabled: boolean
          category_id: string | null
          comment_error: string | null
          comment_id: string | null
          comment_posted_at: string | null
          comment_status: string | null
          comment_text: string | null
          created_at: string
          description: string | null
          error_message: string | null
          id: string
          logs: Json
          privacy_status: string
          published_at: string | null
          scheduled_at: string | null
          status: string
          tags: string[] | null
          title: string
          updated_at: string
          video_id: string | null
          video_url: string | null
          youtube_video_id: string | null
        }
        Insert: {
          account?: string
          auto_comment_enabled?: boolean
          category_id?: string | null
          comment_error?: string | null
          comment_id?: string | null
          comment_posted_at?: string | null
          comment_status?: string | null
          comment_text?: string | null
          created_at?: string
          description?: string | null
          error_message?: string | null
          id?: string
          logs?: Json
          privacy_status?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          video_id?: string | null
          video_url?: string | null
          youtube_video_id?: string | null
        }
        Update: {
          account?: string
          auto_comment_enabled?: boolean
          category_id?: string | null
          comment_error?: string | null
          comment_id?: string | null
          comment_posted_at?: string | null
          comment_status?: string | null
          comment_text?: string | null
          created_at?: string
          description?: string | null
          error_message?: string | null
          id?: string
          logs?: Json
          privacy_status?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          video_id?: string | null
          video_url?: string | null
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "youtube_posts_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_old_publish_queue: { Args: never; Returns: number }
      map_platform_status_to_queue: {
        Args: { _status: string }
        Returns: Database["public"]["Enums"]["publish_queue_status"]
      }
      normalize_platform_status: { Args: { _status: string }; Returns: string }
      sync_publish_queue: {
        Args: never
        Returns: {
          removed: number
          synced: number
        }[]
      }
    }
    Enums: {
      connection_health_status:
        | "connected"
        | "expiring_soon"
        | "expired"
        | "unknown"
      edit_status: "draft" | "editing" | "processing" | "completed" | "failed"
      instagram_connection_status: "CONNECTED" | "PENDING" | "ERROR"
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
      publish_platform: "instagram" | "facebook" | "youtube" | "tiktok"
      publish_queue_status:
        | "PENDING"
        | "PROCESSING"
        | "PUBLISHED"
        | "RETRYING"
        | "FAILED"
        | "NEEDS_ATTENTION"
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
        | "scheduled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      connection_health_status: [
        "connected",
        "expiring_soon",
        "expired",
        "unknown",
      ],
      edit_status: ["draft", "editing", "processing", "completed", "failed"],
      instagram_connection_status: ["CONNECTED", "PENDING", "ERROR"],
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
      publish_platform: ["instagram", "facebook", "youtube", "tiktok"],
      publish_queue_status: [
        "PENDING",
        "PROCESSING",
        "PUBLISHED",
        "RETRYING",
        "FAILED",
        "NEEDS_ATTENTION",
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
        "scheduled",
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
