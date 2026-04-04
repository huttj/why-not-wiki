import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client for server-side operations that need to bypass RLS
// (e.g. reading user emails for conversation attribution)
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return null;
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { persistSession: false } }
  );
}
