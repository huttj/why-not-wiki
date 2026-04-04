import { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export async function isAdmin(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  // Use admin client to bypass RLS and avoid infinite recursion on users table
  const adminClient = createAdminClient();
  if (!adminClient) return false;

  const { data } = await adminClient
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  return data?.is_admin === true;
}

export async function requireAdmin(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    throw new Error("Admin client not configured");
  }

  const { data } = await adminClient
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!data?.is_admin) {
    throw new Error("Forbidden");
  }

  return user;
}
