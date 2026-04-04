import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-side client using the Supabase secret key to bypass RLS
// (e.g. reading user emails for conversation attribution)
export function createAdminClient() {
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) {
    return null;
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secretKey,
    { auth: { persistSession: false } }
  );
}
