
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "board_scraps": {
                  Row: {
                    "added_at": string,"board_id": string,"scrap_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"board_id": string,"scrap_id": string
                  }
                  Update: {
                    "added_at"?: string,"board_id"?: string,"scrap_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "board_scraps_board_id_fkey"
      columns: ["board_id"]
isOneToOne: false
      referencedRelation: "boards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "board_scraps_scrap_id_fkey"
      columns: ["scrap_id"]
isOneToOne: false
      referencedRelation: "scraps"
      referencedColumns: ["id"]
    }
                  ]
                },"boards": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"position": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"position"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"position"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "boards_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "boards_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"feedback": {
                  Row: {
                    "app_version": string | null,"body": string,"created_at": string,"id": string,"locale": string | null,"os_version": string | null,"platform": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "app_version"?: string | null,"body": string,"created_at"?: string,"id"?: string,"locale"?: string | null,"os_version"?: string | null,"platform"?: string | null,"user_id": string
                  }
                  Update: {
                    "app_version"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"locale"?: string | null,"os_version"?: string | null,"platform"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "feedback_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feedback_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"follows": {
                  Row: {
                    "created_at": string,"followee_id": string,"follower_id": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"followee_id": string,"follower_id": string,"id"?: string
                  }
                  Update: {
                    "created_at"?: string,"followee_id"?: string,"follower_id"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "follows_followee_id_fkey"
      columns: ["followee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follows_followee_id_fkey"
      columns: ["followee_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follows_follower_id_fkey"
      columns: ["follower_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follows_follower_id_fkey"
      columns: ["follower_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"item_aliases": {
                  Row: {
                    "created_at": string,"item_id": string,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"item_id": string,"url": string
                  }
                  Update: {
                    "created_at"?: string,"item_id"?: string,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_aliases_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"items": {
                  Row: {
                    "ai_title": string | null,"ai_title_he": string | null,"attempts": number,"author_name": string | null,"canonical_url": string,"category": string | null,"content_language": string | null,"created_at": string,"embed_attempted_at": string | null,"embedded_at": string | null,"embedding": string | null,"embedding_model": string | null,"enriched_at": string | null,"error": string | null,"extracted_json": Json | null,"id": string,"image_path": string | null,"locked_until": string | null,"next_attempt_at": string,"og_description": string | null,"og_image": string | null,"og_title": string | null,"raw_text": string | null,"resolved_url": string | null,"search_summary": string | null,"search_tags": string | null,"search_text": string | null,"search_title": string | null,"site_name": string | null,"source": string,"status": Database["public"]['Enums']["item_status"],"summary_en": string | null,"summary_he": string | null,"tag_labels": NonNullable<Json>,"tags": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_title"?: string | null,"ai_title_he"?: string | null,"attempts"?: number,"author_name"?: string | null,"canonical_url": string,"category"?: string | null,"content_language"?: string | null,"created_at"?: string,"embed_attempted_at"?: string | null,"embedded_at"?: string | null,"embedding"?: string | null,"embedding_model"?: string | null,"enriched_at"?: string | null,"error"?: string | null,"extracted_json"?: Json | null,"id"?: string,"image_path"?: string | null,"locked_until"?: string | null,"next_attempt_at"?: string,"og_description"?: string | null,"og_image"?: string | null,"og_title"?: string | null,"raw_text"?: string | null,"resolved_url"?: string | null,"search_summary"?: never,"search_tags"?: never,"search_text"?: never,"search_title"?: never,"site_name"?: string | null,"source"?: string,"status"?: Database["public"]['Enums']["item_status"],"summary_en"?: string | null,"summary_he"?: string | null,"tag_labels"?: NonNullable<Json>,"tags"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "ai_title"?: string | null,"ai_title_he"?: string | null,"attempts"?: number,"author_name"?: string | null,"canonical_url"?: string,"category"?: string | null,"content_language"?: string | null,"created_at"?: string,"embed_attempted_at"?: string | null,"embedded_at"?: string | null,"embedding"?: string | null,"embedding_model"?: string | null,"enriched_at"?: string | null,"error"?: string | null,"extracted_json"?: Json | null,"id"?: string,"image_path"?: string | null,"locked_until"?: string | null,"next_attempt_at"?: string,"og_description"?: string | null,"og_image"?: string | null,"og_title"?: string | null,"raw_text"?: string | null,"resolved_url"?: string | null,"search_summary"?: never,"search_tags"?: never,"search_text"?: never,"search_title"?: never,"site_name"?: string | null,"source"?: string,"status"?: Database["public"]['Enums']["item_status"],"summary_en"?: string | null,"summary_he"?: string | null,"tag_labels"?: NonNullable<Json>,"tags"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "account_type": Database["public"]['Enums']["account_type"],"ai_consent_at": string | null,"avatar_url": string | null,"bio": string | null,"created_at": string,"display_name": string | null,"id": string,"locale": string,"profile_field_consent": NonNullable<Json>,"updated_at": string,"username": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_type"?: Database["public"]['Enums']["account_type"],"ai_consent_at"?: string | null,"avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"id": string,"locale"?: string,"profile_field_consent"?: NonNullable<Json>,"updated_at"?: string,"username": string
                  }
                  Update: {
                    "account_type"?: Database["public"]['Enums']["account_type"],"ai_consent_at"?: string | null,"avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"locale"?: string,"profile_field_consent"?: NonNullable<Json>,"updated_at"?: string,"username"?: string
                  }
                  Relationships: [
                    
                  ]
                },"scrap_comments": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"edited_at": string | null,"id": string,"scrap_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string,"body": string,"created_at"?: string,"edited_at"?: string | null,"id"?: string,"scrap_id": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"edited_at"?: string | null,"id"?: string,"scrap_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "scrap_comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "scrap_comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "scrap_comments_scrap_id_fkey"
      columns: ["scrap_id"]
isOneToOne: false
      referencedRelation: "scraps"
      referencedColumns: ["id"]
    }
                  ]
                },"scraps": {
                  Row: {
                    "category": string | null,"created_at": string,"id": string,"item_id": string,"original_url": string,"shared_text": string | null,"updated_at": string,"user_category_override": string | null,"user_id": string,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string | null,"created_at"?: string,"id"?: string,"item_id": string,"original_url": string,"shared_text"?: string | null,"updated_at"?: string,"user_category_override"?: string | null,"user_id"?: string,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  Update: {
                    "category"?: string | null,"created_at"?: string,"id"?: string,"item_id"?: string,"original_url"?: string,"shared_text"?: string | null,"updated_at"?: string,"user_category_override"?: string | null,"user_id"?: string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "scraps_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "scraps_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "scraps_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"share_tokens": {
                  Row: {
                    "created_at": string,"id": string,"label": string | null,"last_used_at": string | null,"token_hash": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"label"?: string | null,"last_used_at"?: string | null,"token_hash": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"label"?: string | null,"last_used_at"?: string | null,"token_hash"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "share_tokens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "share_tokens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "public_profiles": {
                  Row: {
                    "account_type": Database["public"]['Enums']["account_type"],"avatar_url": string | null,"bio": string | null,"display_name": string | null,"id": string,"username": string
                  }
                  ComputedFields: never
                  Insert: {
                           "account_type"?: Database["public"]['Enums']["account_type"] | null,"avatar_url"?: never,"bio"?: never,"display_name"?: never,"id"?: string | null,"username"?: string | null
                         }
                        Update: {
                           "account_type"?: Database["public"]['Enums']["account_type"] | null,"avatar_url"?: never,"bio"?: never,"display_name"?: never,"id"?: string | null,"username"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "create_share_token":
{ Args: { "p_label"?: string }; Returns: string
                           },
"delete_orphan_items":
{ Args: { "p_item_ids": (string)[] }; Returns: (string)[]
                           },
"give_ai_consent":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"match_my_scraps":
{ Args: { "p_category"?: string,"p_embedding": string,"p_limit"?: number,"p_min_similarity"?: number }; Returns: {
              "scrap_id": string,"similarity": number
            }[]
                           },
"my_ai_consent":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_boards":
{ Args: Record<PropertyKey, never>; Returns: {
              "covers": Json,"created_at": string,"id": string,"name": string,"position": number,"scraps": number
            }[]
                           },
"my_category_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "category": string,"scraps": number
            }[]
                           },
"related_scraps":
{ Args: { "p_limit"?: number,"p_min_similarity"?: number,"p_scrap_id": string }; Returns: {
              "scrap_id": string,"similarity": number
            }[]
                           },
"reorder_boards":
{ Args: { "p_ids": (string)[] }; Returns: undefined
                           },
"retry_item":
{ Args: { "p_scrap_id": string }; Returns: boolean
                           },
"revoke_share_token":
{ Args: { "p_token": string }; Returns: undefined
                           },
"save_scrap":
{ Args: { "p_canonical_url": string,"p_comment"?: string,"p_original_url": string,"p_shared_text"?: string,"p_source"?: string,"p_visibility"?: Database["public"]['Enums']["visibility"] }; Returns: Json
                           },
"search_my_scraps":
{ Args: { "p_category"?: string,"p_limit"?: number,"p_offset"?: number,"p_query": string }; Returns: {
              "rank": number,"scrap_id": string
            }[]
                           },
"send_feedback":
{ Args: { "p_app_version"?: string,"p_body": string,"p_locale"?: string,"p_os_version"?: string,"p_platform"?: string }; Returns: string
                           },
"set_all_scraps_visibility":
{ Args: { "p_visibility": Database["public"]['Enums']["visibility"] }; Returns: number
                           },
"share_add_comment":
{ Args: { "p_body": string,"p_scrap_id": string,"p_token": string }; Returns: undefined
                           },
"share_save":
{ Args: { "p_canonical_url": string,"p_original_url": string,"p_shared_text"?: string,"p_source": string,"p_token": string }; Returns: Json
                           },
"share_set_visibility":
{ Args: { "p_scrap_id": string,"p_token": string,"p_visibility": Database["public"]['Enums']["visibility"] }; Returns: undefined
                           },
"username_available":
{ Args: { "p_username": string }; Returns: boolean
                           },
"worker_claim_items":
{ Args: { "p_limit"?: number,"p_max_attempts"?: number }; Returns: {
              "ai_title": string | null,
"ai_title_he": string | null,
"attempts": number,
"author_name": string | null,
"canonical_url": string,
"category": string | null,
"content_language": string | null,
"created_at": string,
"embed_attempted_at": string | null,
"embedded_at": string | null,
"embedding": string | null,
"embedding_model": string | null,
"enriched_at": string | null,
"error": string | null,
"extracted_json": Json | null,
"id": string,
"image_path": string | null,
"locked_until": string | null,
"next_attempt_at": string,
"og_description": string | null,
"og_image": string | null,
"og_title": string | null,
"raw_text": string | null,
"resolved_url": string | null,
"search_summary": string | null,
"search_tags": string | null,
"search_text": string | null,
"search_title": string | null,
"site_name": string | null,
"source": string,
"status": Database["public"]['Enums']["item_status"],
"summary_en": string | null,
"summary_he": string | null,
"tag_labels": NonNullable<Json>,
"tags": (string)[],
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: false
        isSetofReturn: true
      } },
"worker_resolve_item":
{ Args: { "p_canonical_url": string,"p_item": string,"p_source": string }; Returns: Json
                           },
"worker_shared_texts":
{ Args: { "p_item": string,"p_limit"?: number }; Returns: string[]
                           }
          }
          Enums: {
            "account_type": "public"|"private","item_status": "pending"|"fetching"|"enriching"|"ready"|"failed","visibility": "private"|"followers"|"public"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_type": ["public", "private"],"item_status": ["pending", "fetching", "enriching", "ready", "failed"],"visibility": ["private", "followers", "public"]
          }
        }
} as const
