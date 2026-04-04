import { SupabaseClient } from "@supabase/supabase-js";

export async function isAdmin(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data } = await supabase
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

  const { data } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!data?.is_admin) {
    throw new Error("Forbidden");
  }

  return user;
}
