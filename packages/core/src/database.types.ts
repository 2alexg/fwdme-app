
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
            "follows": {
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
                },"items": {
                  Row: {
                    "ai_title": string | null,"canonical_url": string,"category": string | null,"created_at": string,"enriched_at": string | null,"error": string | null,"extracted_json": Json | null,"id": string,"og_description": string | null,"og_image": string | null,"og_title": string | null,"raw_text": string | null,"source": string,"status": Database["public"]['Enums']["item_status"],"summary_en": string | null,"summary_he": string | null,"tags": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_title"?: string | null,"canonical_url": string,"category"?: string | null,"created_at"?: string,"enriched_at"?: string | null,"error"?: string | null,"extracted_json"?: Json | null,"id"?: string,"og_description"?: string | null,"og_image"?: string | null,"og_title"?: string | null,"raw_text"?: string | null,"source"?: string,"status"?: Database["public"]['Enums']["item_status"],"summary_en"?: string | null,"summary_he"?: string | null,"tags"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "ai_title"?: string | null,"canonical_url"?: string,"category"?: string | null,"created_at"?: string,"enriched_at"?: string | null,"error"?: string | null,"extracted_json"?: Json | null,"id"?: string,"og_description"?: string | null,"og_image"?: string | null,"og_title"?: string | null,"raw_text"?: string | null,"source"?: string,"status"?: Database["public"]['Enums']["item_status"],"summary_en"?: string | null,"summary_he"?: string | null,"tags"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "account_type": Database["public"]['Enums']["account_type"],"avatar_url": string | null,"bio": string | null,"created_at": string,"display_name": string | null,"id": string,"locale": string,"profile_field_consent": NonNullable<Json>,"updated_at": string,"username": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_type"?: Database["public"]['Enums']["account_type"],"avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"id": string,"locale"?: string,"profile_field_consent"?: NonNullable<Json>,"updated_at"?: string,"username": string
                  }
                  Update: {
                    "account_type"?: Database["public"]['Enums']["account_type"],"avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"locale"?: string,"profile_field_consent"?: NonNullable<Json>,"updated_at"?: string,"username"?: string
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
                    "created_at": string,"id": string,"item_id": string,"original_url": string,"shared_text": string | null,"updated_at": string,"user_category_override": string | null,"user_id": string,"visibility": Database["public"]['Enums']["visibility"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"item_id": string,"original_url": string,"shared_text"?: string | null,"updated_at"?: string,"user_category_override"?: string | null,"user_id"?: string,"visibility"?: Database["public"]['Enums']["visibility"] | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"item_id"?: string,"original_url"?: string,"shared_text"?: string | null,"updated_at"?: string,"user_category_override"?: string | null,"user_id"?: string,"visibility"?: Database["public"]['Enums']["visibility"] | null
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
            "save_scrap":
{ Args: { "p_canonical_url": string,"p_comment"?: string,"p_original_url": string,"p_shared_text"?: string,"p_source"?: string,"p_visibility"?: Database["public"]['Enums']["visibility"] }; Returns: Json
                           },
"username_available":
{ Args: { "p_username": string }; Returns: boolean
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
